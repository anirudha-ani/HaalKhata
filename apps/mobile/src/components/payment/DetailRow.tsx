/** One detail row of the payment method form: what kind of detail it is, its value, and a way to drop it. */

import { ChevronDown, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Chip } from "@/components/ui/Chip";
import { detailKindName } from "@haalkhata/shared/payment/detailKinds";
import type { DetailDraft } from "@haalkhata/shared/payment/methodDraft";
import { colors, spacing } from "@/lib/theme/theme";
import { DetailValueField } from "./DetailValueField";

/**
 * Renders one detail of the method being edited: its kind on the first
 * line, with the remove button, and its value on the whole second line.
 *
 * The kind is changed by tapping it, which opens the choices as chips right
 * there in the row. Inline rather than in a second sheet: the form is
 * already in one, and a sheet opened over a sheet is where this platform is
 * least dependable.
 *
 * @param props - Component props.
 * @returns The row, with its error underneath when it has one.
 */
export function DetailRow({
  detail,
  preset,
  kinds,
  error,
  canRemove,
  onKindChange,
  onChange,
  onRemove,
}: {
  /** The row being edited. */
  detail: DetailDraft;
  /** The method's preset key, or "". */
  preset: string;
  /** Kinds this row may be switched between. */
  kinds: readonly string[];
  /** What is wrong with this row; empty when nothing is. */
  error: string;
  /** Whether the row can be dropped. */
  canRemove: boolean;
  /** Called with the kind picked. */
  onKindChange: (kindKey: string) => void;
  /** Called with the typed fields that changed. */
  onChange: (patch: Partial<DetailDraft>) => void;
  /** Called when the row is dropped. */
  onRemove: () => void;
}) {
  const [choosingKind, setChoosingKind] = useState(false);
  const kindName = detailKindName(detail.kind);
  const canSwitchKind = kinds.length > 1;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Pressable
          accessibilityHint={canSwitchKind ? "Changes the kind of detail" : undefined}
          accessibilityLabel={`Kind of detail: ${kindName}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: choosingKind }}
          disabled={!canSwitchKind}
          onPress={() => setChoosingKind(!choosingKind)}
          style={styles.kind}
        >
          <Text style={styles.kindText}>{kindName}</Text>
          {canSwitchKind ? <ChevronDown color={colors.inkSoft} size={16} /> : null}
        </Pressable>
        {canRemove ? (
          <Pressable
            accessibilityLabel={`Remove ${kindName}`}
            accessibilityRole="button"
            onPress={onRemove}
            style={styles.remove}
          >
            <X color={colors.inkSoft} size={18} />
          </Pressable>
        ) : null}
      </View>
      {choosingKind ? (
        <View style={styles.kindChoices}>
          {kinds.map((kindKey) => (
            <Chip
              key={kindKey}
              label={detailKindName(kindKey)}
              onPress={() => {
                onKindChange(kindKey);
                setChoosingKind(false);
              }}
              selected={kindKey === detail.kind}
            />
          ))}
        </View>
      ) : null}
      <DetailValueField detail={detail} onChange={onChange} preset={preset} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "500",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  kind: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
  },
  kindChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  kindText: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: "500",
  },
  remove: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  row: {
    gap: spacing.xs,
  },
});
