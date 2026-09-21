import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';

const resolveSrc = (src) => {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  return staticFile(String(src).replace(/^\//,''));
};

export const DsnThumbnailMaster = ({config}) => {
  const background = resolveSrc(config.backgroundSrc);
  const homeCrest = resolveSrc(config.home?.crestSrc);
  const awayCrest = resolveSrc(config.away?.crestSrc);
  const vertical = config.aspectRatio !== '16:9';
  const logoWidth = vertical ? 190 : 250;
  const headlineSize = vertical ? 92 : 100;

  return (
    <AbsoluteFill style={{
      background:'#08090d',
      color:'#fff',
      fontFamily:'Arial, Helvetica, sans-serif',
      overflow:'hidden'
    }}>
      {background ? <Img src={background} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/> : null}
      <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(5,7,12,.08),rgba(5,7,12,.18) 42%,rgba(5,7,12,.88) 100%)'}}/>

      <Img
        src={staticFile('brand/dsn-official-logo.png')}
        style={{
          position:'absolute',
          top:vertical?52:36,
          left:vertical?44:54,
          width:logoWidth,
          height:logoWidth*1.05,
          objectFit:'contain',
          filter:'drop-shadow(0 12px 30px rgba(0,0,0,.58))'
        }}
      />

      {config.kicker ? <div style={{
        position:'absolute',top:vertical?245:62,right:vertical?46:58,
        fontSize:vertical?26:24,fontWeight:950,letterSpacing:'.09em',
        padding:'10px 15px',background:'rgba(0,0,0,.72)',
        borderBottom:'5px solid #e11d2e'
      }}>{config.kicker}</div>:null}

      {(homeCrest || awayCrest || config.score) ? <div style={{
        position:'absolute',
        left:vertical?54:'28%',
        right:vertical?54:'28%',
        top:vertical?'43%':'33%',
        display:'grid',
        gridTemplateColumns:'1fr auto 1fr',
        alignItems:'center',
        gap:vertical?22:34,
        filter:'drop-shadow(0 12px 26px rgba(0,0,0,.6))'
      }}>
        <div style={{display:'flex',justifyContent:'center'}}>
          {homeCrest?<Img src={homeCrest} style={{width:vertical?190:205,height:vertical?190:205,objectFit:'contain'}}/>:null}
        </div>
        <div style={{fontSize:vertical?112:126,fontWeight:1000,lineHeight:1,textShadow:'0 8px 22px #000'}}>
          {config.score || ''}
        </div>
        <div style={{display:'flex',justifyContent:'center'}}>
          {awayCrest?<Img src={awayCrest} style={{width:vertical?190:205,height:vertical?190:205,objectFit:'contain'}}/>:null}
        </div>
      </div>:null}

      <div style={{
        position:'absolute',
        left:vertical?50:70,
        right:vertical?50:70,
        bottom:vertical?135:70,
        textAlign:config.headlineAlign || 'center'
      }}>
        <div style={{
          fontSize:headlineSize,
          fontWeight:1000,
          lineHeight:.91,
          letterSpacing:'-.045em',
          textTransform:'uppercase',
          textShadow:'0 9px 26px rgba(0,0,0,.85)'
        }}>{config.headline}</div>
        {config.subhead?<div style={{
          marginTop:20,fontSize:vertical?34:36,fontWeight:850,
          color:'#ff3445',textTransform:'uppercase',letterSpacing:'.03em'
        }}>{config.subhead}</div>:null}
      </div>
    </AbsoluteFill>
  );
};
