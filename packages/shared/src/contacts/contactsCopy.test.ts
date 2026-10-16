/** Tests for the find-friends and discoverability wording. */

import { describe, expect, it } from "vitest";
import { ContactRelation } from "@haalkhata/protogen/social/v1/social_pb";
import {
  checkingLabel,
  friendRequestTitle,
  partialCheckMessage,
  relationAction,
  sendAllLabel,
  sendAllQuestion,
} from "./contactsCopy";

describe("contacts copy", () => {
  it("previews the exact notification title the server sends", () => {
    expect(friendRequestTitle("Anirudha")).toBe("Anirudha sent you a friend request");
  });

  it("labels each row by where the caller stands", () => {
    expect(relationAction(ContactRelation.NONE)).toBe("Add");
    expect(relationAction(ContactRelation.REQUESTED)).toBe("Requested");
    expect(relationAction(ContactRelation.INCOMING)).toBe("Accept");
    expect(relationAction(ContactRelation.FRIEND)).toBe("Friends");
    expect(relationAction(ContactRelation.UNSPECIFIED)).toBe("Add");
  });

  it("counts people and contacts with grouped numbers and the right plural", () => {
    expect(sendAllLabel(12)).toBe("Send to all 12");
    expect(sendAllQuestion(1)).toBe("Send 1 friend request?");
    expect(sendAllQuestion(1240)).toBe("Send 1,240 friend requests?");
    expect(checkingLabel(1)).toBe("Checking 1 contact…");
    expect(checkingLabel(1240)).toBe("Checking 1,240 contacts…");
    expect(partialCheckMessage(5000, 6200)).toBe(
      "Checked 5,000 of 6,200 phone numbers and emails. The rest can be checked tomorrow.",
    );
  });
});
