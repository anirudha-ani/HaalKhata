# Live split

Start an expense, press **Split live**, and share it with the table. It is the
normal expense form, opened to everyone: there is no separate screen. Anyone with
the link joins the expense and gets the same full edit as you for 30 minutes, and
everyone can see who has joined and who has saved.

It is an ordinary bill with a way in, so it asks nothing a bill would not: any way
of splitting, any number of people who paid, and nobody has to settle.

## What people see

1. **Split live** is at the top of the expense form and first on a saved bill's
   page. Press it at any point, even on an empty form: what is there is saved in the
   background, and the QR code and invite link appear right away.
2. Behind the invite is the same form, now with a bar along the top: how long is
   left, everyone's avatar, **Invite** to show the link again, and **Finish now** for
   whoever started it.
3. The link opens the join page, which names the bill. Joining needs an account:
   anyone new signs up and comes back here. On a group's bill the page says that
   joining also joins the group.
4. Whoever joins lands on the same edit form, on the bill as a participant. They
   can change anything: lines, amounts, who paid, who is on it, the receipt.
5. Each avatar shows a state. **Joined** is faded in a dashed ring. **Saved** has a
   solid ring and a tick. Everyone sees the same thing, on the form and on the bill's
   page, within a few seconds and without reloading.
6. **Save** works as it always does, and merges: two people can save the same bill.
   What somebody saves reaches every open form with a note saying who changed what,
   and only a part two people changed differently asks to keep one.
7. It ends after 30 minutes, or at **Finish now**. Everyone on the bill then hears
   what they owe, once.

## The rules, and why

- **Nothing stops the first press.** A half-filled form is saved as it stands. With
  no amount yet the bill is simply at zero, a blank name becomes "Receipt", a line
  with no price waits, and half-typed amounts start as an even split. One that is
  never filled in is removed when the split ends, and shows in nobody's list.
- **Joining adds you and moves no money.** You are on the expense straight away
  with nothing to pay, so nobody's typing is disturbed by a join. On an even split
  an open form ticks you as soon as it sees you, and you share from the next save.
  That is what the two avatar states mean: joined, and counted.
- **Nobody gets a free meal.** A save from a form that had not seen you yet counts
  you on an even split, and so does the end of the split if nobody saved after you
  joined. Only somebody who saw you and left you unticked takes you off it.
- **Starting a split does not put you on the bill.** Whoever started it can stay off
  a bill they are not on, as they could before.
- **Leaving a group leaves the split.** Somebody who joined a group's bill and leaves
  the group while a split runs drops out with nothing owed, and saves carry on. The end
  of a split holds to what a save would: an archived group's bill, or a former
  member whose balance would move, stays as it is.
- **A block between two people stops nobody else.** The link refuses you only if
  you have blocked, or been blocked by, whoever started it or somebody on the bill.
- **What each person paid follows the total.** A total moves as people edit, so
  what was paid moves with it, keeping its proportions, on every kind of split. A
  bill's payers always add up: the save refuses anything else.
- **Lines may be unclaimed.** While a split runs, a line nobody is on counts against
  whoever paid, so the ledger is exact at every moment, and the form's summary shows
  exactly that: what each person would owe if the bill were saved now, tax and tip
  included. When it ends those lines stay with whoever paid, and everyone left with
  nothing to pay comes off the bill.
- **Ending stops nobody mid-claim.** A split ends on a clock or at the press of a
  button, not when everyone has finished tapping. For a day after it ends, anyone who
  was in it can still open the bill and save. What they claimed comes off whoever
  paid, and everyone else's claims stand. Somebody who claimed nothing stays off the
  bill and loses sight of it when the day is up.
- **One announcement.** Nothing reaches the feed or anyone's bell while it runs. At
  the end the result goes out once: as a new expense if the split created it, as an
  edit if anything changed, and not at all if nothing did.
- **Adding your card connects you.** On a one-off bill, joining connects you with
  whoever started it and whoever paid, and whoever starts paying becomes friends with
  everyone on it, because a friendship is what lets them settle.
- **Who was in it is not kept.** `live_split_people` holds who joined and when they
  saved, for the avatars and for saving late, and goes a day after the split ends.

## Run it locally

Point a dev server at a throwaway database, then sign in three accounts in three
browser profiles, or two and the phone app:

```sh
docker exec haalkhata-db-1 psql -U haalkhata -d postgres -c "CREATE DATABASE hk_live"
cd apps/web
DATABASE_URL=postgres://haalkhata:change-me@127.0.0.1:5432/hk_live \
  node scripts/next.mjs dev --turbopack -H 127.0.0.1 -p 3112
```

1. As the first person, open **Add expense** and press **Split live** at the top.
   The invite appears with the bill saved behind it.
2. Open **Invite** and open the link as the others, swapping the shown host for
   `http://127.0.0.1:3112`.
3. Each person lands on the edit form. Save on one, and within 3 seconds the other
   sees their avatar turn saved and their change arrive in the form.
4. Tap **Finish now** and check the bell on the other accounts.

To see a late save, have one account tap a line and not save, press **Finish now** on
the account that started it, then press **Save changes** on the first. The claim lands
and the amount comes off whoever paid.

To see one end by itself without waiting 30 minutes:

```sh
docker exec haalkhata-db-1 psql -U haalkhata -d hk_live \
  -c "UPDATE live_splits SET ends_at = now() WHERE finished_at IS NULL"
```

The sweep picks it up within 30 seconds. Drop the database when you are done.

## Tests

`expense/usecase/liveSplit/liveSplit.integration.test.ts` runs the whole session
against real Postgres. `@haalkhata/shared/expense/live` and `merge` hold the pure
rules and their tests.
