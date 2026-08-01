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
      className="flex shrink-0"
    >
      {/* Label collapses to just the icon on a phone so the address beside it
          keeps room to breathe. */}
      <Button type="submit" variant="outline" size="sm" aria-label="Sign out">
        <MIcon name="logout" size={16} className="sm:mr-1.5" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </form>
  );
}
