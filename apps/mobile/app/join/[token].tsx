/** Public invite route; data and presentation are owned by the join screen. */

import { useLocalSearchParams } from "expo-router";
import { JoinScreen } from "@/screens/join/components/JoinScreen/JoinScreen";

/** @returns The invite screen for the token in this universal link. */
export default function JoinRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <JoinScreen token={typeof token === "string" ? token : ""} />;
}
