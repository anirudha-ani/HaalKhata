/** Tests for the find-friends and discoverability wording. */

import { describe, expect, it } from "vitest";
import { ContactRelation } from "@haalkhata/protogen/social/v1/social_pb";
import {
  addRequestPreview,
  checkingLabel,
  friendRequestTitle,
  onHaalKhataAs,
  partialCheckMessage,
  relationAction,
} from "./contactsCopy";

describe("contacts copy", () => {
  it("previews the exact notification title the server sends", () => {
    expect(friendRequestTitle("Anirudha")).toBe("Anirudha sent you a friend request");
  });

  it("quotes that same notification above the people found, before any Add", () => {
    expect(addRequestPreview("Anirudha")).toBe(
      "Add sends one friend request. They see “Anirudha sent you a friend request”.",
    );
  });

  it("names the account under a differently saved contact", () => {
    expect(onHaalKhataAs("Rifat Hasan")).toBe("On HaalKhata as Rifat Hasan");
  });

  it("labels each row by where the caller stands", () => {
    expect(relationAction(ContactRelation.NONE)).toBe("Add");
    expect(relationAction(ContactRelation.REQUESTED)).toBe("Requested");
    expect(relationAction(ContactRelation.INCOMING)).toBe("Accept");
    expect(relationAction(ContactRelation.FRIEND)).toBe("Friends");
    expect(relationAction(ContactRelation.UNSPECIFIED)).toBe("Add");
  });

  it("counts contacts with grouped numbers and the right plural", () => {
    expect(checkingLabel(1)).toBe("Checking 1 contact…");
    expect(checkingLabel(1240)).toBe("Checking 1,240 contacts…");
    expect(partialCheckMessage(5000, 6200)).toBe(
      "Checked 5,000 of 6,200 phone numbers and emails. The rest can be checked tomorrow.",
    );
  });
});
