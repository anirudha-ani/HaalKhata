/** One person in a live split: their avatar, in a state that says whether they have saved. */

import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { livePersonLabel } from "@haalkhata/shared/expense/live/live.constants";
import { Avatar } from "@/components/ui/Avatar";
import { colors } from "@/lib/theme/theme";

/**
 * Renders somebody in a live split. Joined is a faded avatar in a dashed ring;
 * saved is a solid ring with a tick. The ring and the tick say it, not colour
 * alone, and the label says it to anybody who cannot see them.
 *
 * @param props - Component props.
 * @param props.user - The person.
 * @param props.saved - Whether they have pressed Save.
 * @returns The avatar.
 */
export function LiveAvatar({ user, saved }: { user: User; saved: boolean }) {
  return (
    <View
      accessibilityLabel={livePersonLabel(user.name, saved)}
      accessibilityRole="image"
      accessible
      style={[styles.ring, saved ? styles.saved : styles.joined]}
    >
      <View style={saved ? undefined : styles.faded}>
        <Avatar size="sm" user={user} />
      </View>
      {saved ? (
        <View style={styles.tick}>
          <Check color={colors.white} size={11} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  faded: {
    opacity: 0.5,
  },
  joined: {
    borderColor: colors.inkSoft,
    borderStyle: "dashed",
  },
  ring: {
    borderRadius: 999,
    borderWidth: 2,
    padding: 2,
  },
  saved: {
    borderColor: colors.pos700,
  },
  tick: {
    alignItems: "center",
    backgroundColor: colors.pos700,
    borderRadius: 999,
    bottom: -4,
    height: 16,
    justifyContent: "center",
    position: "absolute",
    right: -4,
    width: 16,
  },
});
