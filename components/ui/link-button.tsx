"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { ShineButton } from "./shine-button";
import { SecondaryButton } from "./secondary-button";

// ShineButton / SecondaryButton with next/link pre-bound.
//
// A server component can't pass `as={Link}` itself: the component reference
// crosses the server→client boundary as a plain function and RSC refuses to
// serialize it ("Functions cannot be passed directly to Client Components").
// Binding Link here keeps it entirely on the client side, so these are the
// link variants to reach for from anywhere — server or client.

export function ShineLink(props: Omit<ComponentProps<typeof ShineButton>, "as">) {
  return <ShineButton {...props} as={Link} />;
}

export function SecondaryLink(props: Omit<ComponentProps<typeof SecondaryButton>, "as">) {
  return <SecondaryButton {...props} as={Link} />;
}
