# Payment Method Service (`payment.v1.PaymentMethodService`)

Where a person wants to be paid: a list of payment methods they define for
themselves.

The Payment Method Service is essential for:

- **Paying someone back:** settling in this app only records that a payment
  happened. The money moves in a wallet or a bank app, so what the payer
  needs is the recipient's details for whichever of those they use.
- **Methods nobody had to add by hand:** a method is a name, a currency and a
  few labelled details, typed by its owner. bKash, UPI or a bank account in
  any country exists here without a code change.
- **A preferred choice:** one method per currency can be starred, and a
  settle dialog opens on it.
- **Keeping account numbers private:** a person's methods reach somebody
  else only while that somebody owes them.

Implementation: [handler.ts](../../../apps/web/src/server/payment/handler.ts) →
[paymentMethod.usecase.ts](../../../apps/web/src/server/payment/usecase/paymentMethod.usecase.ts),
SQL in [paymentMethods.repo.ts](../../../apps/web/src/server/payment/repo/paymentMethods.repo.ts).
Validation, the catalog of detail kinds, the starting points and the order a
payer is shown methods in live in
[packages/shared/src/payment/](../../../packages/shared/src/payment/), because
both clients run the same code for their forms.

---

## A Payment Method

| Part | Rule |
| --- | --- |
| Name | Required, 1 to 40 characters: "Chase checking", "bKash". |
| Currency | One ISO 4217 code from the catalog, or empty for "any currency". |
| Details | 1 to 8, in the owner's order. Each has a kind and a value. |
| Note | Optional, up to 200 characters, one line: "Send as friends and family". |
| Preferred | At most one method per person per currency, with "any currency" a bucket of its own. |
| Preset | `venmo`, `zelle`, `cashapp` or `paypal` when started from a built-in app, otherwise empty. Fixed at creation. A preset carries exactly one detail. |

### Detail kinds

| Kind | Meaning | Check |
| --- | --- | --- |
| `phone` | Phone number | A valid number with its country code; stored in E.164. |
| `email` | Email | Shaped like an email address. |
| `username` | Username or ID | None. A preset's sigil or address stem is stripped. |
| `account_name` | Account holder name | None. |
| `bank_name` | Bank name | None. |
| `account_type` | Account type | `checking`, `savings` or `current`. |
| `account_number` | Account number | None. |
| `routing_number` | Routing number | None. |
| `swift` | SWIFT / BIC | 8 or 11 letters and digits; stored compact and in capitals. |
| `iban` | IBAN | 15 to 34 letters and digits; stored compact and in capitals. |
| `link` | Payment link | `https://` with a plain ASCII host and nothing in front of it. |
| `custom` | Anything else, with the owner's own label (1 to 30 characters) | The label must not name a secret (PIN, password, CVV, OTP). |

Values are capped at 120 characters (300 for a link), trimmed, and otherwise
stored exactly as typed. The checks are deliberately light: this app cannot
know whether an account number is real, so it refuses only what cannot be
right in any country. Anything country-specific (an IFSC, a sort code) is a
`custom` detail, which is what keeps the list of kinds from growing a row
per country.

A link is strict on purpose. The host is what a payer is shown before they
open it, and a `user@` part, a backslash or a look-alike Unicode letter can
each make a link display one site and open another, so none is accepted.

## The Authorization Model

| Viewer | Sees |
| --- | --- |
| The owner | Everything, through this service. |
| Someone who owes the owner, in any currency or inside any one scope | Every method, on `expense.v1.ExpenseService/GetFriendLedger` (`payee_methods`). |
| A friend, group member or expense participant who owes them nothing | Nothing. |
| A pending friend-request sender, or a stranger | Nothing. |
| The recipient of a reminder | Method names only, in the notification text. |

Every RPC here acts on the caller's own methods. A method that belongs to
somebody else reads as `NotFound`, the same as one that does not exist, so
the answer never confirms that an id is real.

There is deliberately no RPC for reading another person's methods. The
friend ledger is the only door, so there is one rule to keep right. A scope
counts on its own: a single balance can be settled alone, so a caller who
owes inside one group is sent the details even when the pair's net points
the other way.

Methods are **not** on `common.v1.User`, are not copied into notifications
or activity rows, and are removed with the account (`ON DELETE CASCADE`).

## Consistency

Every write runs in one transaction under the owner's **payment-methods
advisory lock** (`payment-methods:<userId>`). Two rules are read-then-write
and hold only because a person's saves take turns:

- **The cap of 12 methods.** It cannot be a CHECK; without the lock, twenty
  parallel adds each read a count below the cap.
- **One star per currency.** Taking the star clears whichever method held it
  for that currency. A partial unique index
  (`uq_payment_methods_preferred`) is the backstop.

The lock is taken alone, never together with a ledger lock, so it adds
nothing to the lock order.

`updated_at` moves only when the name, currency, details or note change. It
is what tells a payer that details changed recently, so re-saving an
untouched form, or only moving the star, leaves it alone.

## Vocabularies

| Value set | Values |
| --- | --- |
| Limits | 12 methods per person; 8 details per method |
| Rate limit | 30 writes/min per account, one bucket shared by create, update, delete and set-preferred |
| Settlement key for a method | The preset's own key; `bank` when the method carries an account number, IBAN, routing number or SWIFT code; `other` otherwise |

---

## Overview of Endpoints

1. [ListMyPaymentMethods](#1-listmypaymentmethods)
2. [CreatePaymentMethod](#2-createpaymentmethod)
3. [UpdatePaymentMethod](#3-updatepaymentmethod)
4. [DeletePaymentMethod](#4-deletepaymentmethod)
5. [SetPreferredPaymentMethod](#5-setpreferredpaymentmethod)

---

### 1. ListMyPaymentMethods

**Method:** `ListMyPaymentMethods`
**Route:** `POST /api/connect/payment.v1.PaymentMethodService/ListMyPaymentMethods`

#### Notes

- Returns the caller's methods, oldest first.
- Methods copied from the retired payment handles are dated from their
  owner's account, so they sort ahead of anything added since and do not
  read as a recent change.

#### Response

**ListPaymentMethodsResponse:**

| Field | Type | Description |
| --- | --- | --- |
| methods | repeated PaymentMethod | Oldest first. |

**PaymentMethod:**

| Field | Type | Description |
| --- | --- | --- |
| id | string | UUID. |
| name | string | What the owner calls it. |
| currency | string | ISO 4217; empty = any currency. |
| preset | string | `venmo` \| `zelle` \| `cashapp` \| `paypal`, or empty. |
| details | repeated PaymentDetail | `kind`, `label` (custom only), `value`. |
| note | string | Optional instruction for the payer. |
| preferred | bool | Starred for its currency. |
| updated_at | string | When the name, currency, details or note last changed. |
| created_at | string | When it was added. Equal to `updated_at` for a method never edited, which lets a client say "added" instead of "changed". |

**Sample Response (JSON):**

```json
{
  "methods": [
    {
      "id": "2ef2e751-dee3-4505-9a62-b6845a0cb7a4",
      "name": "bKash",
      "currency": "BDT",
      "details": [{ "kind": "phone", "value": "+8801712345678" }],
      "note": "Use Send Money, not Payment",
      "preferred": true,
      "updatedAt": "2026-10-10T16:34:12.589Z",
      "createdAt": "2026-10-10T16:34:12.589Z"
    }
  ]
}
```

---

### 2. CreatePaymentMethod

**Method:** `CreatePaymentMethod`
**Route:** `POST /api/connect/payment.v1.PaymentMethodService/CreatePaymentMethod`

#### Notes

- Validated with the shared validator the clients run for their inline
  errors, before any transaction opens. Rows with a blank value are dropped,
  so a bank form can be saved with only the fields a person's bank needs.
- `preferred: true` takes the star from whichever method held it for that
  currency, in the same transaction.
- **Errors:** a field that fails validation is `InvalidArgument`, naming the
  first problem in form order. At 12 methods the request is
  `FailedPrecondition`.
- **Not idempotent** (no `operation_id`): a retried create makes a second
  method. No money is involved, the clients disable the button while the
  save is in flight, and a duplicate is a visible row its owner can remove.

#### Request

**CreatePaymentMethodRequest:**

| Field | Type | Description |
| --- | --- | --- |
| name | string | Required. |
| currency | string | ISO 4217; empty = any currency. |
| preset | string | A built-in app key, or empty. |
| details | repeated PaymentDetail | At least one with a value. |
| note | string | Optional. |
| preferred | bool | Star it for its currency. |

**Sample Request (JSON):**

```json
{
  "name": "Chase checking",
  "currency": "USD",
  "details": [
    { "kind": "account_name", "value": "Rahim Uddin" },
    { "kind": "account_type", "value": "checking" },
    { "kind": "account_number", "value": "000123454821" },
    { "kind": "custom", "label": "Branch", "value": "Downtown" }
  ]
}
```

#### Response

The stored `PaymentMethod`.

---

### 3. UpdatePaymentMethod

**Method:** `UpdatePaymentMethod`
**Route:** `POST /api/connect/payment.v1.PaymentMethodService/UpdatePaymentMethod`

#### Notes

- A full replacement of everything the form shows: name, currency, the
  complete detail list, note, and the star as the form left it.
- The preset is not part of the request. A Venmo method cannot be turned
  into a bank account, because its one detail is what its link is built
  from; the request is validated against the stored preset.
- `preferred: true` takes the star for the method's currency, the new one
  if the currency changed. `false` gives it up. A starred method is
  unstarred before its currency moves, so carrying it into a currency that
  already has a star cannot trip the unique index.
- **Errors:** `NotFound` for a method that is not the caller's;
  `InvalidArgument` for a field that fails validation.

#### Request

**UpdatePaymentMethodRequest:**

| Field | Type | Description |
| --- | --- | --- |
| id | string | The method to replace. |
| name | string | Required. |
| currency | string | ISO 4217; empty = any currency. |
| details | repeated PaymentDetail | The complete new list. |
| note | string | Optional. |
| preferred | bool | The star as the form left it. |

#### Response

The stored `PaymentMethod`.

---

### 4. DeletePaymentMethod

**Method:** `DeletePaymentMethod`
**Route:** `POST /api/connect/payment.v1.PaymentMethodService/DeletePaymentMethod`

#### Notes

- Removes the method and its details. A settlement that was recorded with
  it keeps the method's name, which was copied onto the settlement.
- **Errors:** `NotFound` for a method that is not the caller's, including
  one already removed.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| id | string | The method to remove. |

#### Response

Empty.

---

### 5. SetPreferredPaymentMethod

**Method:** `SetPreferredPaymentMethod`
**Route:** `POST /api/connect/payment.v1.PaymentMethodService/SetPreferredPaymentMethod`

#### Notes

- The star on a list row. `preferred: true` clears the star in the method's
  currency bucket and sets it on this method; `false` clears only this one.
- Returns the whole list, since starring one method un-stars another.
- Does not move `updated_at`: a star changes which method is suggested, not
  where the money goes.
- **Errors:** `NotFound` for a method that is not the caller's.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| id | string | The method to star or unstar. |
| preferred | bool | Whether it carries the star. |

#### Response

**ListPaymentMethodsResponse**, the caller's whole list.
