# Live split

Scan a receipt or type its lines, then open it to the whole table for 30
minutes. Everyone joins through a link, claims what they had and fixes the bill
together. Nobody's phone buzzes while that happens. When it ends, everyone on the
expense hears what they owe, once.

It is an ordinary bill with a way to join on the spot, so it asks nothing a bill
would not. Any number of people can have paid, the normal Edit form works
throughout, and nobody has to settle: the bill stays in everyone's balances for
as long as they like.

## What people see

1. On the expense form, in Itemized, **Split live with the table** saves the bill
   and opens it. Any itemized expense has **Split live** on its own page too, so
   anyone on the bill can open it again after it ends.
2. **Invite** shows the link, a QR code and the share sheet.
3. The link opens the join page, which names the bill and its total. Joining needs
   an account: anyone new signs up and comes back here. On a group's bill the page
   says that joining also joins the group.
4. Each line has a chip per person. Tapping one puts them on the line or takes
   them off, for yourself or anyone else. Two people on a line share it. Anyone can
   correct a line, add one, remove one, or set the tax and tip.
5. **Paid by** lists who paid. If you put a card down too, tap your name under
   **Also paid** and enter what it was: the others' amounts adjust so the bill still
   adds up. Enter the whole bill and you take it over, which is also how to fix a
   bill that named the wrong person. Anyone can do this for anyone.
6. The screen shows your share of the bill and what nobody has claimed. **Settle**
   sits beside each person you owe, for now or for later. Once you have paid it says
   your share is settled. Whoever paid more than their share sees what they covered
   for others.
7. **Edit** on the expense's page opens the normal form at any time, for anything
   the live screen does not do: a friend who is not at the table, unequal portions,
   the date or the notes.
8. It ends after 30 minutes, or when whoever started it taps **Finish now**.

## The rules, and why

- **The ledger is right at every moment.** Each tap is an ordinary saved edit. A
  line nobody has claimed counts against whoever paid, in proportion to what each
  paid, so before anyone claims anything nobody owes anybody, not even by a cent.
- **Nothing is refused for not adding up.** A total moves as lines change, so what
  each person paid moves with it, keeping their proportions. If a card's real
  figure differs, change it in **Paid by**. Outside a live split several people's
  typed amounts stay theirs to change, and a save that breaks them says so.
- **Adding your card connects you.** On a one-off bill, whoever starts paying
  becomes friends with everyone on it, because a debt now runs between them and a
  friendship is what lets them settle it.
- **A debt runs to particular people.** With several payers each person owes
  whichever payers the ledger's rule names, which is why Settle sits beside each
  payer instead of under the total.
- **The balance is read when it can have changed.** Every tap at the table rereads
  the bill on every phone, so who you still owe is its own read (`ListOwedPeople`).
  It runs only for somebody who owes on the bill, when that debt changes or a
  payment is recorded. Until it answers, or if it fails, whoever the bill says you
  owe stays owed, so nobody is told they are settled when they are not.
- **One announcement.** Nothing reaches the feed or anyone's bell while it runs.
  At the end the result goes out once: as a new expense if the split created it,
  as an edit if it changed one, and not at all if nothing changed.
- **The end moves no money.** Lines nobody claimed are written to those who paid,
  leaving an ordinary expense that the normal form can edit.
- **Who is in it is not kept.** `live_split_people` gives somebody with no share yet
  access while it runs, and is deleted when it ends. Anyone who claimed nothing
  loses access then.
- **Settle covers the balance, not the bill.** The figure on the screen is your
  share of this bill, and the Settle button uses the pair's normal balance in that
  scope. If you already owed that person, or have already paid part of it, the
  dialog lists what is really owed. You can change the amount there.

## Run it locally

Point a dev server at a throwaway database, then sign in three accounts in three
browser profiles, or two and the phone app:

```sh
docker exec haalkhata-db-1 psql -U haalkhata -d postgres -c "CREATE DATABASE hk_live"
cd apps/web
DATABASE_URL=postgres://haalkhata:change-me@127.0.0.1:5432/hk_live \
  node scripts/next.mjs dev --turbopack -H 127.0.0.1 -p 3112
```

1. As the first person, add an expense, pick **Itemized**, add lines, then
   **Split live with the table**.
2. Open **Invite** and open the link as the others, swapping the shown host for
   `http://127.0.0.1:3112`.
3. Tap chips on two screens at once. Each sees the other's taps within 3 seconds.
4. Tap **Finish now** and check the bell on the other accounts.

To see one end by itself without waiting 30 minutes:

```sh
docker exec haalkhata-db-1 psql -U haalkhata -d hk_live \
  -c "UPDATE live_splits SET ends_at = now() WHERE finished_at IS NULL"
```

The sweep picks it up within 30 seconds. Drop the database when you are done.

## Tests

`expense/usecase/liveSplit/liveSplit.integration.test.ts` runs the whole session
against real Postgres. `@haalkhata/shared/expense/live` and `merge` hold the pure
rules and their tests, and each app tests its screen's tap queue in `useLiveSplit`.
