/** A live split in one strip: who is here, who has saved, and how to bring in more. */

import { Radio, Share2 } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { GetExpenseResponse } from "@haalkhata/shared/api/plainMessages";
import {
  LIVE_INVITE_EXPLAINER,
  LIVE_INVITE_TITLE,
  liveSavedCount,
} from "@haalkhata/shared/expense/live/live.constants";
import { InviteShareSheet } from "@/components/modals/InviteShareSheet";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { shareLiveSplit } from "@/lib/invite/share";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { LiveAvatar } from "./components/LiveAvatar/LiveAvatar";
import { useLiveBar } from "./hooks/useLiveBar";

/**
 * Sits at the top of a bill while it is open to the table, on the form and on
 * its screen alike, so everyone sees the same people in the same states.
 *
 * @param props - Component props.
 * @param props.expenseId - The expense.
 * @param props.description - What it is called, for the invite's wording.
 * @param props.liveSplit - The split running on it.
 * @param props.users - Everyone it names.
 * @param props.meId - Who is looking.
 * @param props.startSharing - Whether the invite opens by itself.
 * @returns The bar.
 */
export function LiveBar({
  expenseId,
  description,
  liveSplit,
  users,
  meId,
  startSharing = false,
}: {
  expenseId: string;
  description: string;
  liveSplit: NonNullable<GetExpenseResponse["liveSplit"]>;
  users: readonly User[];
  meId: string;
  startSharing?: boolean;
}) {
  const liveBar = useLiveBar(expenseId, liveSplit, startSharing);
  const savedIds = new Set(liveSplit.savedIds);
  const people = liveSplit.peopleIds.flatMap((userId) => users.filter((user) => user.id === userId));
  const myName = users.find((user) => user.id === meId)?.name ?? "";

  return (
    <View accessibilityLabel="Live split" style={styles.bar}>
      <View style={styles.headline}>
        <Radio color={colors.brand700} size={16} />
        <Text style={styles.time}>Live{liveBar.timeLeft ? ` · ${liveBar.timeLeft}` : ""}</Text>
      </View>
      <View style={styles.people}>
        {people.map((person) => (
          <LiveAvatar key={person.id} saved={savedIds.has(person.id)} user={person} />
        ))}
        <Text style={styles.count}>{liveSavedCount(savedIds.size, people.length)}</Text>
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            compact
            icon={<Share2 color={colors.white} size={14} />}
            label="Invite"
            onPress={() => liveBar.setSharing(true)}
          />
        </View>
        {liveSplit.hostId === meId ? (
          <View style={styles.action}>
            <Button busy={liveBar.isFinishing} compact label="Finish now" onPress={liveBar.finish} variant="outline" />
          </View>
        ) : null}
      </View>
      {liveBar.error ? <Text style={styles.error}>{liveBar.error}</Text> : null}
      {liveBar.sharing ? (
        <InviteShareSheet
          explainer={LIVE_INVITE_EXPLAINER}
          onClose={() => liveBar.setSharing(false)}
          share={() => shareLiveSplit(liveSplit.token, myName, description)}
          title={LIVE_INVITE_TITLE}
          token={liveSplit.token}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  bar: {
    backgroundColor: colors.brand50,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  count: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  error: {
    color: colors.brand700,
    fontSize: 13,
  },
  headline: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  people: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  time: {
    color: colors.brand700,
    fontSize: 14,
    fontWeight: "600",
  },
});
