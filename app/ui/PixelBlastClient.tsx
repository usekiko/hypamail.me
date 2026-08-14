"use client";

import dynamic from "next/dynamic";

// WebGL + `document` at module scope, so it can only mount in the browser.
// Unlike Beams this doesn't pull in @react-three/fiber, so there's no global
// JSX.IntrinsicElements pollution to dodge and the import can stay typed.
const PixelBlast = dynamic(() => import("./PixelBlast"), { ssr: false });

export default PixelBlast;
