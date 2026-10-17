/** The "send to all" action above the people who can still be asked. */

import { UserPlus } from "lucide-react-native";
import { sendAllLabel } from "@haalkhata/shared/contacts/contactsCopy";
import { Button } from "@/components/ui/Button";
import { colors } from "@/lib/theme/theme";

/**
 * Opens the confirm sheet that lists everyone before anything is sent —
 * the button itself sends nothing, and nobody is pre-selected.
 *
 * @param props - Component props.
 * @returns The button.
 */
export function SendAllBar({
  count,
  onPress,
}: {
  /** People who would be asked. */
  count: number;
  /** Opens the confirm sheet. */
  onPress: () => void;
}) {
  return (
    <Button
      icon={<UserPlus color={colors.inkSoft} size={16} />}
      label={sendAllLabel(count)}
      onPress={onPress}
      variant="outline"
    />
  );
}
