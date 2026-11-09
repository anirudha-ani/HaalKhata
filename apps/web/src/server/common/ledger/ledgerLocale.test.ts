/** Verify the real shared matching implementation under a non-English runtime locale. */

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps server UUID matching when Node's default locale is Danish", () => {
  const source = pathToFileURL(resolve("../../packages/shared/src/expense/debts.ts")).href;
  const program = `import { expenseDebts } from ${JSON.stringify(source)};
    const people = ['aaaaaaaa-1111-4111-8111-111111111111','abaaaaaa-1111-4111-8111-111111111111','ffffffff-1111-4111-8111-111111111111'];
    console.log(JSON.stringify({ locale: new Intl.Collator().resolvedOptions().locale,
      defaultOrder: [...people].sort((first, second) => first.localeCompare(second)),
      debts: expenseDebts([{userId: people[2], amountCents: 1}, {userId: people[0], amountCents: 1}],
        [{userId: people[1], amountCents: 2}]) }));`;
  const result = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", program], {
    encoding: "utf8", env: { ...process.env, LANG: "da_DK.UTF-8", LC_ALL: "da_DK.UTF-8" },
  }));
  expect(result.locale).toBe("da-DK");
  expect(result.defaultOrder[0]).toBe("abaaaaaa-1111-4111-8111-111111111111");
  expect(result.debts).toEqual([
    { from: "abaaaaaa-1111-4111-8111-111111111111", to: "aaaaaaaa-1111-4111-8111-111111111111", amountCents: 1 },
    { from: "abaaaaaa-1111-4111-8111-111111111111", to: "ffffffff-1111-4111-8111-111111111111", amountCents: 1 },
  ]);
});
