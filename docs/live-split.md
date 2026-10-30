# Live split

Scan a receipt or type its lines, then open it to the whole table for 30
minutes. Everyone joins through a link, claims what they had and fixes the bill
together. Nobody's phone buzzes while that happens. When it ends, everyone on the
expense hears what they owe, once.

## What people see

1. On the expense form, in Itemized, **Split live with the table** saves the bill
   and opens it. An itemized expense with one payer has **Split live** on its own
   page too.
2. **Invite** shows the link, a QR code and the share sheet.
3. The link opens the join page, which names the bill and its total. Joining needs
   an account: anyone new signs up and comes back here. On a group's bill the page
   says that joining also joins the group.
4. Each line has a chip per person. Tapping one puts them on the line or takes
   them off, for yourself or anyone else. Two people on a line share it. Anyone can
   correct a line, add one, remove one, or set the tax and tip.
5. The screen shows your share of the bill, with Settle beside it, and what
   nobody has claimed. Once you have paid it says your share is settled. Whoever paid
   sees everyone else's shares.
6. It ends after 30 minutes, or when whoever started it taps **Finish now**.

## The rules, and why

- **The ledger is right at every moment.** Each tap is an ordinary saved edit. A
  line nobody has claimed counts against whoever paid, so before anyone claims
  anything nobody owes anybody.
- **One payer.** Unclaimed lines have to belong to somebody, and a total that moves
  as lines change cannot keep several people's typed amounts adding up.
- **One announcement.** Nothing reaches the feed or anyone's bell while it runs.
  At the end the result goes out once: as a new expense if the split created it,
  as an edit if it changed one, and not at all if nothing changed.
- **The end moves no money.** Lines nobody claimed are written to whoever paid,
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
