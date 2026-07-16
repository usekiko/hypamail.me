"use client";

// Sign-out must wipe the unlocked mail key from this tab before the server
// session is revoked — otherwise the key would linger in sessionStorage.
import { logoutAction } from "../actions";
import { clearMailKey } from "@/lib/client/crypto";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { MIcon } from "@/components/ui/material-icon";

export default function SignOut() {
  return (
    <form
      action={logoutAction}
      onSubmit={() => {
        clearMailKey();
      }}
      style={{ display: "flex" }}
    >
      <SecondaryButton type="submit" size="sm" title="Sign out">
        <MIcon name="logout" size={16} style={{ marginRight: 6 }} />
        Sign out
      </SecondaryButton>
    </form>
  );
}
