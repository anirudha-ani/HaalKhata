/** Phone input: country picker on the left (a searchable sheet), national number on the right. */

import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { PHONE_COUNTRIES, phoneCountry, splitE164 } from "@haalkhata/shared/phone/phone";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { SearchField } from "./SearchField";
import { Sheet } from "./Sheet";
import { MAX_VISIBLE_COUNTRIES } from "./ui.constants";

/**
 * Renders a phone number as the two things it actually is: a country and a
 * national number. One bordered group so it still reads as a single field.
 *
 * The country side opens a sheet with a search box over every country
 * libphonenumber knows, because 240 rows cannot be scanned but "bang",
 * "880" and "BD" each find Bangladesh in a keystroke or three.
 *
 * @param props - Component props.
 * @returns The phone field.
 */
export function PhoneField({
  region,
  nationalNumber,
  onRegionChange,
  onNationalNumberChange,
  placeholder = "(617) 555-1212",
  label = "Phone number",
}: {
  /** Selected ISO 3166-1 alpha-2 region code. */
  region: string;
  /** National number as typed, without the country code. */
  nationalNumber: string;
  /** Called with the region code when the user picks a country. */
  onRegionChange: (region: string) => void;
  /** Called with the raw text of the number box on every keystroke. */
  onNationalNumberChange: (nationalNumber: string) => void;
  /** Placeholder for the number box. */
  placeholder?: string;
  /** Accessible label for the number box. */
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = phoneCountry(region);
  const terms = searchTerms(query);
  // Name, dial code and region code are all searched, so "bang", "880" and
  // "BD" each find Bangladesh — people reach for whichever they know.
  const matches = PHONE_COUNTRIES.filter((country) =>
    matchesTerms(terms, country.name, country.dialCode, country.region),
  );
  const visible = matches.slice(0, MAX_VISIBLE_COUNTRIES);

  /**
   * Picks a country and closes the sheet, clearing the query so the next
   * open starts from the whole set rather than the last search.
   *
   * @param nextRegion - Region code of the country chosen.
   */
  const choose = (nextRegion: string) => {
    onRegionChange(nextRegion);
    setQuery("");
    setIsOpen(false);
  };

  /**
   * Handles typing or pasting in the number box. A value that arrives as a
   * full international number sets the country from it instead of being
   * appended to whichever country happens to be selected.
   *
   * @param value - The number box's new raw value.
   */
  const changeNumber = (value: string) => {
    const pasted = splitE164(value);
    if (pasted) {
      onRegionChange(pasted.region);
      onNationalNumberChange(pasted.nationalNumber);
      return;
    }
    onNationalNumberChange(value);
  };

  return (
    <View style={styles.group}>
      <Pressable
        accessibilityLabel={`Country: ${selected.name} +${selected.dialCode}`}
        accessibilityRole="button"
        onPress={() => setIsOpen(true)}
        style={styles.country}
      >
        <Text style={styles.flag}>{selected.flag}</Text>
        <Text style={styles.dialCode}>+{selected.dialCode}</Text>
        <ChevronDown color={colors.inkSoft} size={16} />
      </Pressable>
      <View style={styles.divider} />
      <TextInput
        accessibilityLabel={label}
        autoComplete="tel-national"
        keyboardType="phone-pad"
        onChangeText={changeNumber}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
        value={nationalNumber}
      />

      {isOpen ? (
        <Sheet onClose={() => setIsOpen(false)} title="Country">
          <View style={styles.sheetBody}>
            <SearchField
              autoFocus
              onChange={setQuery}
              placeholder="Search countries"
              value={query}
            />
            {matches.length === 0 ? (
              <Text style={styles.hint}>No country matches that.</Text>
            ) : (
              <View style={styles.listCard}>
                {visible.map((country, index) => {
                  const isSelected = country.region === selected.region;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      key={country.region}
                      onPress={() => choose(country.region)}
                      style={[
                        styles.row,
                        index > 0 ? styles.rowDivider : null,
                        isSelected ? styles.rowSelected : null,
                      ]}
                    >
                      <Text style={styles.flag}>{country.flag}</Text>
                      <Text
                        numberOfLines={1}
                        style={[styles.rowName, isSelected ? styles.rowNameSelected : null]}
                      >
                        {country.name}
                      </Text>
                      <Text style={styles.rowDialCode}>+{country.dialCode}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {matches.length > visible.length ? (
              <Text style={styles.hint}>
                Showing {visible.length} of {matches.length} — keep typing to narrow it down.
              </Text>
            ) : null}
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  country: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  dialCode: {
    color: colors.ink,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  divider: {
    backgroundColor: colors.line,
    marginVertical: spacing.sm,
    width: 1,
  },
  flag: {
    fontSize: 16,
  },
  group: {
    alignItems: "stretch",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  listCard: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowDialCode: {
    color: colors.inkSoft,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowName: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
  },
  rowNameSelected: {
    color: colors.brand700,
    fontWeight: "600",
  },
  rowSelected: {
    backgroundColor: colors.brand50,
  },
  sheetBody: {
    gap: spacing.md,
  },
});
