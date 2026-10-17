/** One person found among the caller's contacts, with the action their state allows. */

import { StyleSheet, View } from "react-native";
import { ContactRelation } from "@haalkhata/protogen/social/v1/social_pb";
import { onHaalKhataAs, relationAction } from "@haalkhata/shared/contacts/contactsCopy";
import { accountNameHint, type FoundPerson } from "@haalkhata/shared/contacts/matches";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * Shows the name the person is saved under on this phone, the account's own
 * name when it differs (a contact saved as "Mom" shows who is really on
 * HaalKhata), and one action: Add, Accept, or the state it is already in.
 *
 * @param props - Component props.
 * @returns The row.
 */
export function FoundContactRow({
  person,
  busy,
  onAdd,
  onAccept,
}: {
  /** The found person. */
  person: FoundPerson;
  /** Whether this row's action is in flight. */
  busy: boolean;
  /** Sends them a request. */
  onAdd: () => void;
  /** Accepts the request they sent. */
  onAccept: () => void;
}) {
  const hint = accountNameHint(person);
  const label = relationAction(person.relation);
  return (
    <View style={styles.row}>
      <Avatar user={person.user} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.name}>{person.contactNames[0]}</Text>
        {hint ? <Text numberOfLines={1} style={styles.hint}>{onHaalKhataAs(hint)}</Text> : null}
      </View>
      {person.relation === ContactRelation.NONE ? (
        <Button busy={busy} compact label={label} onPress={onAdd} />
      ) : person.relation === ContactRelation.INCOMING ? (
        <Button busy={busy} compact label={label} onPress={onAccept} variant="positive" />
      ) : (
        <Text style={styles.state}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  name: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  state: { color: colors.inkSoft, fontSize: 13, fontWeight: "600" },
  text: { flex: 1, minWidth: 0 },
});
