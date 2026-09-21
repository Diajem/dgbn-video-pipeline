import React from 'react';
import {AbsoluteFill} from 'remotion';

export const BrandedEndCard = ({brand = 'DGBN'}) => {
  const isDSN = brand === 'DSN';
  const accent = isDSN ? '#ff2633' : '#d7a62a';
  const network = isDSN ? 'DIAJEM SPORTS NETWORK' : 'DIAJEM GLOBAL BLACK NEWS';
  const tagline = isDSN ? 'FOOTBALL TALKS BIGGER' : 'OUR PEOPLE. OUR STORY. OUR OWN WAY.';

  return (
    <AbsoluteFill style={{
      zIndex: 200,
      background: isDSN
        ? 'linear-gradient(160deg,#090a0d 0%,#16181d 100%)'
        : 'linear-gradient(160deg,#070707 0%,#15120a 100%)',
      color:'#fff',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      flexDirection:'column',
      textAlign:'center',
      fontFamily:'Arial, Helvetica, sans-serif',
      padding:'0 70px'
    }}>
      <div style={{fontSize:88,fontWeight:1000,letterSpacing:'-.03em'}}>{brand}</div>
      <div style={{marginTop:10,fontSize:24,fontWeight:850,letterSpacing:'.12em',color:accent}}>{network}</div>
      <div style={{marginTop:42,fontSize:46,fontWeight:1000,lineHeight:1.05}}>
        THANKS FOR WATCHING {brand}
      </div>
      <div style={{marginTop:22,fontSize:28,fontWeight:850,letterSpacing:'.03em'}}>{tagline}</div>
    </AbsoluteFill>
  );
};
