import { Text, View } from "react-native";
import { designTokens } from "@dealse/design-tokens";

export default function Index() {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: designTokens.color.background,
        flex: 1,
        justifyContent: "center",
        padding: designTokens.spacing[6],
      }}
    >
      <Text style={{ color: designTokens.color.customer, fontWeight: "700" }}>
        DealSe Customer · app shell
      </Text>
      <Text style={{ color: designTokens.color.muted, marginTop: 8 }}>
        Foundation only; product flows will be added in scoped tasks.
      </Text>
    </View>
  );
}
