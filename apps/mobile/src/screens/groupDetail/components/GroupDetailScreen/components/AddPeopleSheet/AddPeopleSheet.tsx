/** Bottom sheet holding the add-people form: your people, an email or phone, and the invite link for somebody not on HaalKhata. */

import { StyleSheet, View } from "react-native";
import { NOT_ON_HAALKHATA_COPY } from "@haalkhata/shared/invite/inviteCopy";
import { PersonChecklist } from "@/components/people/PersonChecklist";
import { Button } from "@/components/ui/Button";
import { EmailOrPhoneField } from "@/components/ui/EmailOrPhoneField";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";
import type { GroupDetailController } from "../../hooks/useGroupDetail";

/**
 * Adds people to the group: the caller's people not already in it, then an
 * email or phone for somebody connected with them some other way. A
 * contact nobody on HaalKhata has is answered with the group's invite link
 * to share, in place of an error. Every failure is said in the sheet beside
 * what caused it: the form's under "Add to group", and a failed share in
 * the offer, under its button, where the offer would otherwise hide it.
 *
 * @param props - Component props.
 * @returns The sheet.
 */
export function AddPeopleSheet({
  groupName,
  groupDetail,
}: {
  /** The group's name, for the title. */
  groupName: string;
  /** The group screen's controller from useGroupDetail. */
  groupDetail: GroupDetailController;
}) {
  return (
    <Sheet
      footer={
        <View style={styles.addForm}>
          {!groupDetail.inviteOffer && groupDetail.peopleError ? (
            <Text accessibilityRole="alert" style={styles.addError}>{groupDetail.peopleError}</Text>
          ) : null}
          <Button
            busy={groupDetail.addMembers.isPending}
            disabled={!groupDetail.canAddPeople}
            label="Add to group"
            onPress={groupDetail.submitPeople}
          />
        </View>
      }
      onClose={() => groupDetail.setAddingPeople(false)}
      title={`Add people to ${groupName}`}
    >
      {/* People you already know come first; typing an address is the
          fallback for somebody you are connected with but who is not on
          that list. It never creates an account — the server enrols only
          people the caller already shares a friendship or a group with. */}
      <View style={styles.addForm}>
        {groupDetail.candidates.length > 0 ? (
          <>
            <Text style={styles.addLabel}>
              Your people
              {groupDetail.pickedIds.length > 0
                ? ` · ${groupDetail.pickedIds.length} selected`
                : ""}
            </Text>
            <PersonChecklist
              disabledIds={
                new Set(
                  groupDetail.candidates
                    .filter((candidate) => !candidate.registered)
                    .map((candidate) => candidate.id),
                )
              }
              disabledHint="deleted their account"
              onToggle={groupDetail.togglePicked}
              people={groupDetail.candidates}
              selectedIds={groupDetail.pickedIds}
            />
          </>
        ) : (
          <Text style={styles.addHint}>
            Everyone on your friends list is already here. Know somebody from another group?
            Add them below.
          </Text>
        )}

        <Text style={styles.addLabel}>Not on the list?</Text>
        <EmailOrPhoneField
          contact={groupDetail.contact}
          onContactChange={groupDetail.setContact}
          emailPlaceholder="Email address"
          emailLabel="Email of somebody already connected with you"
          phoneLabel="Phone of somebody already connected with you"
        />
        <Text style={styles.addHint}>
          Works for anyone already connected with you on HaalKhata — a friend, or someone you
          share another group with. New here? Send them a friend request from Friends first;
          once they accept, you can add them.
        </Text>

        {groupDetail.inviteOffer ? (
          <View style={styles.inviteOffer}>
            <Text accessibilityRole="alert" style={styles.addHint}>
              {NOT_ON_HAALKHATA_COPY.group.message}
            </Text>
            <Button
              busy={groupDetail.sharingLinkForOffer}
              compact
              label={NOT_ON_HAALKHATA_COPY.group.action}
              onPress={groupDetail.shareLinkForOffer}
            />
            {groupDetail.offerError ? (
              <Text accessibilityRole="alert" style={styles.addError}>{groupDetail.offerError}</Text>
            ) : null}
            <Button
              compact
              label="Cancel"
              onPress={groupDetail.dismissInviteOffer}
              variant="outline"
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  addError: {
    color: colors.brand600,
    fontSize: 14,
  },
  addForm: {
    gap: spacing.lg,
  },
  addHint: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -spacing.sm,
  },
  addLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: -spacing.sm,
  },
  inviteOffer: {
    gap: spacing.sm,
  },
});
