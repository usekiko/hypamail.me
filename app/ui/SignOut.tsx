"use client";

// Sign-out must wipe the unlocked mail key from this tab before the server
// session is revoked — otherwise the key would linger in sessionStorage.
import { logoutAction } from "../actions";
import { clearMailKey } from "@/lib/client/crypto";

export default function SignOut() {
  return (
    <form
      action={logoutAction}
      onSubmit={() => {
        clearMailKey();
      }}
    >
      <button className="btn btn-cancel" type="submit" style={{ padding: "0.55rem 2rem" }}>
        sign out
      </button>
    </form>
  );
}
