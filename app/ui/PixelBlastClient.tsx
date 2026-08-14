"use client";

import dynamic from "next/dynamic";

// WebGL + `document` at module scope, so it can only mount in the browser.
const PixelBlast = dynamic(() => import("./PixelBlast"), { ssr: false });

export default PixelBlast;
