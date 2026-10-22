/** State and save for the profile step: the name friends see and the default currency. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { authClient, errorMessage } from "@/lib/api/connect";

/**
 * Holds the two fields, seeded from the account (Apple and Google usually
 * supply the name), and saves them with UpdateProfile. A failed save stays
 * on the step with the reason under the fields.
 *
 * @param user - The signed-in account.
 * @param onSaved - Called once the profile is saved.
 * @returns The fields with setters, the save action, its busy flag and error.
 */
export function useProfileStep(user: User, onSaved: () => void) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [currency, setCurrency] = useState(user.defaultCurrency || "USD");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () => authClient.updateProfile({ name: name.trim(), defaultCurrency: currency }),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.me, profile);
      onSaved();
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  return {
    name,
    setName,
    currency,
    setCurrency,
    error,
    busy: save.isPending,
    /** Saves both fields and moves on. */
    save: () => {
      setError("");
      save.mutate();
    },
  };
}
