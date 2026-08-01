"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

interface BeamsProps {
  beamWidth?: number;
  beamHeight?: number;
  beamNumber?: number;
  lightColor?: string;
  speed?: number;
  noiseIntensity?: number;
  scale?: number;
  rotation?: number;
}

// Deliberately untyped import: Beams.tsx pulls in @react-three/fiber, which
// globally augments JSX.IntrinsicElements with every Three.js element the
// moment any file in the program imports it -- and tsconfig's `exclude`
// doesn't stop that (a file reachable via `import` is still added to the
// compilation regardless of exclude patterns). That huge intrinsics union
// broke `children` typing on unrelated polymorphic components elsewhere
// (components/ui/shine-button.tsx, secondary-button.tsx's `as` prop), which
// are shared with hypastack and shouldn't be touched to work around this.
// TS's dynamic-import type inference only kicks in for a string *literal*
// argument, so routing the specifier through a plain `string`-typed constant
// stops it from resolving Beams.tsx's types into the program at all. The
// specifier itself is unchanged at runtime, so Turbopack still statically
// analyses and code-splits it normally.
const beamsSpecifier: string = "./Beams";
const Beams = dynamic(() => import(beamsSpecifier).then((m) => (m as { default: ComponentType<BeamsProps> }).default), {
  ssr: false,
}) as ComponentType<BeamsProps>;

export default Beams;
