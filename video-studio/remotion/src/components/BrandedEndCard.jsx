import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import BRANDS from '../../../../config/brands.json';

// Unknown brands fall back to DGBN Africa, the original DGBN brand.
export const brandInfo = (brand) => BRANDS[brand] || BRANDS.DGBN;

export const BrandedEndCard = ({brand = 'DGBN'}) => {
  const info = brandInfo(brand);

  return (
    <AbsoluteFill style={{
      zIndex: 200,
      background: info.background,
      color:'#fff',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      flexDirection:'column',
      textAlign:'center',
      fontFamily:'Arial, Helvetica, sans-serif',
      padding:'0 70px'
    }}>
      {info.logo ? (
        <Img
          src={staticFile(info.logo)}
          style={{width:240,height:252,objectFit:'contain',filter:'drop-shadow(0 14px 32px rgba(0,0,0,.5))'}}
        />
      ) : (
        <>
          <div style={{fontSize:88,fontWeight:1000,letterSpacing:'-.03em'}}>{info.tag}</div>
          <div style={{marginTop:10,fontSize:24,fontWeight:850,letterSpacing:'.12em',color:info.accent}}>{info.network}</div>
        </>
      )}
      <div style={{marginTop:42,fontSize:46,fontWeight:1000,lineHeight:1.05}}>
        THANKS FOR WATCHING {info.tag}
      </div>
      <div style={{marginTop:22,fontSize:28,fontWeight:850,letterSpacing:'.03em'}}>{info.tagline}</div>
    </AbsoluteFill>
  );
};
