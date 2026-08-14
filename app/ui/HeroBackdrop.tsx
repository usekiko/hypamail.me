"use client";

import { useEffect, useState } from "react";
import PixelBlast from "./PixelBlastClient";
import LoadingCover from "./LoadingCover";

export default function HeroBackdrop() {
  const [bgReady, setBgReady] = useState(false);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <>
      <div className="absolute inset-0 h-full w-full opacity-40">
        <PixelBlast
          variant="circle"
          pixelSize={narrow ? 4 : 3}
          color="#ffffff"
          patternScale={narrow ? 1.6 : 2.5}
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
          edgeFade={narrow ? 0.08 : 0.21}
          transparent
          onReady={() => setBgReady(true)}
        />
      </div>
      <LoadingCover extraReady={bgReady} />
    </>
  );
}
