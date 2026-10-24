/** Wording for the report queue: what each kind of content is called and what each action does to it. */

/** Something the operator can do through a report. */
export type ModerationAction = "dismiss" | "remove" | "suspend" | "resume";

/**
 * How the queue words each kind of reported content: its `label` on the
 * card, the `removeLabel` on its remove button, and `removeEffect`, the
 * whole of what removing it does, said before the operator confirms.
 */
export const TARGET_KIND_WORDING: Record<
  string,
  { label: string; removeLabel: string; removeEffect: string }
> = {
  comment: {
    label: "Comment",
    removeLabel: "Delete comment",
    removeEffect:
      "The comment is deleted for everyone. The feed lines and notifications about this author's comments on that expense, this one and any others, change to “Content removed after moderation”. This can't be undone.",
  },
  expense: {
    label: "Expense",
    removeLabel: "Remove its text",
    removeEffect:
      "The description becomes “Content removed”, the notes are emptied and every item is renamed “Item”. Every feed line and notification about this expense, its comments included, changes to “Content removed after moderation”. The amount, who paid and who owes stay exactly as they are. This can't be undone.",
  },
  group: {
    label: "Group name",
    removeLabel: "Reset the name",
    removeEffect:
      "The group is renamed “Shared group”. Every line in the group's feed (its expenses, payments and members, since each one names the group) and every notification about the group changes to “Content removed after moderation”. Its members, expenses and balances stay as they are. This can't be undone.",
  },
  user: {
    label: "Profile",
    removeLabel: "Reset the profile",
    removeEffect:
      "Their name becomes “Member” and their profile picture is removed. Every feed line and notification about something they did, in every group, changes to “Content removed after moderation”, since each one starts with their name. Their account, sign-in and balances stay as they are. This can't be undone.",
  },
};

/** What suspending an author does, said before the operator confirms. */
export const SUSPEND_EFFECT =
  "They are signed out everywhere, on the web and on their phones, and cannot sign in until you resume them. Their expenses and balances stay as they are for everyone they share them with. The report stays open.";

/** What an action is called in a sentence about it failing: "Couldn't {verb}". */
export const ACTION_VERBS: Record<ModerationAction, string> = {
  dismiss: "dismiss the report",
  remove: "remove the content",
  suspend: "suspend the author",
  resume: "resume the author",
};

/** Shown in place of the suspend button when the author's account was merged into another. */
export const MERGED_AUTHOR_NOTE =
  "This account was merged into another, so there is no one to suspend through this report.";

/** Shown beside a suspended account that has no report left to resume through. */
export const NO_REPORT_TO_RESUME_NOTE =
  "No report about them is left to resume through. Resume them on the server; see ops/README.md.";

/** Shown when nothing is waiting. */
export const EMPTY_QUEUE_NOTE =
  "Nothing is waiting. When someone reports a comment, an expense, a group or a profile in the app, it shows up here.";
