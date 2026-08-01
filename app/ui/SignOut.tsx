"use client";

// Sign-out must wipe the unlocked mail key from this tab before the server
// session is revoked — otherwise the key would linger in sessionStorage.
import { logoutAction } from "../actions";
import { clearMailKey } from "@/lib/client/crypto";
import { Button } from "@heroui/react";
import { MIcon } from "@/components/ui/material-icon";

export default function SignOut() {
  return (
    <form
      action={logoutAction}
      onSubmit={() => {
        clearMailKey();
      }}
      className="flex"
    >
      <Button type="submit" variant="outline" size="sm">
        <MIcon name="logout" size={16} style={{ marginRight: 6 }} />
        Sign out
      </Button>
    </form>
  );
}
