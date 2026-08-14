"use client";

import { useState } from "react";
import PixelBlast from "./PixelBlastClient";
import LoadingCover from "./LoadingCover";

export default function HeroBackdrop() {
  const [bgReady, setBgReady] = useState(false);

  return (
    <>
      <div className="absolute inset-0 h-full w-full opacity-40">
        <PixelBlast
          variant="circle"
          pixelSize={3}
          color="#ffffff"
          patternScale={2.5}
          patternDensity={0.7}
          pixelSizeJitter={0.8}
          enableRipples={false}
          rippleSpeed={0.4}
          rippleThickness={0.12}
          rippleIntensityScale={1.5}
          liquid={false}
          liquidStrength={0.12}
          liquidRadius={1.2}
          liquidWobbleSpeed={5}
          speed={0.55}
          edgeFade={0.21}
          transparent
          onReady={() => setBgReady(true)}
        />
      </div>
      <LoadingCover extraReady={bgReady} />
    </>
  );
}
