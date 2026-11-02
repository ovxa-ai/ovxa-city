"""Procedural soundtrack + UI SFX for docs/launch-x.mp4 (original, no samples). python3 scripts/launch_audio.py -> /workspace/audio/mix.wav, then mux with ffmpeg loudnorm I=-14."""
import numpy as np, wave
from scipy.signal import butter, sosfilt
SR=48000; D=14.47; N=int(SR*D); t=np.arange(N)/SR; rng=np.random.default_rng(7)
def lp(x,f,o=2): return sosfilt(butter(o,f,'low',fs=SR,output='sos'),x)
def hp(x,f,o=2): return sosfilt(butter(o,f,'high',fs=SR,output='sos'),x)
def bp(x,a,b): return sosfilt(butter(2,[a,b],'band',fs=SR,output='sos'),x)
def env(n,a,r): e=np.ones(n); a=int(a*SR); r=int(r*SR); e[:a]=np.linspace(0,1,a); e[-r:]*=np.linspace(1,0,r); return e
mf=lambda m:440*2**((m-69)/12)
L=np.zeros(N); R=np.zeros(N)
def add(sig,at,gl=1,gr=1):
    i=int(at*SR)
    if i>=N: return
    j=min(N,i+len(sig)); L[i:j]+=sig[:j-i]*gl; R[i:j]+=sig[:j-i]*gr
BPM=112; beat=60/BPM; bar=4*beat
chords=[[53,57,60,64,67],[57,60,64,67,71],[50,57,60,62,65],[46,53,57,60,62]]  # Fmaj9 Am7 Dm9 Bbmaj9
bass=[41,45,38,46]
# pads
for k in range(int(D/bar)+1):
    ch=chords[k%4]; st=k*bar; n=int((bar+0.6)*SR); tt=np.arange(n)/SR
    for m in ch:
        for det,pan in [(-0.07,0.8),(0.07,1.2)]:
            f=mf(m)*2**(det/12); ph=rng.random()
            s=2*((tt*f+ph)%1)-1
            add(lp(s,1400+600*np.sin(k))*env(n,0.35,0.7)*0.045,st,pan,2-pan)
    # sub bass pulses on 8ths with sidechain feel
    for q in range(8):
        n2=int(beat/2*SR); tt2=np.arange(n2)/SR; f=mf(bass[k%4])
        s=np.sin(2*np.pi*f*tt2)+0.25*np.sin(4*np.pi*f*tt2)
        add(s*np.minimum(1,tt2/0.03)*np.exp(-tt2*4)*0.16,st+q*beat/2)
    # pluck arp 16ths
    arp=[ch[i] + 12 for i in [0,2,4,3,1,3,2,4]]
    for q in range(16):
        n3=int(0.35*SR); tt3=np.arange(n3)/SR; f=mf(arp[q%8])
        s=(np.sin(2*np.pi*f*tt3)+0.3*np.sin(4*np.pi*f*tt3+0.5))*np.exp(-tt3*14)
        p=0.6+0.8*((q%2))
        add(s*0.035,st+q*beat/4,p,2-p)
# drums: start after 1 bar build
for b in range(int(D/beat)+1):
    at=b*beat
    if at>=bar*0.5:
        if b%2==0:  # kick on 1 and 3 (soft)
            n=int(0.4*SR); tt=np.arange(n)/SR; f=45+90*np.exp(-tt*35)
            add(np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*9)*0.42,at)
        else:  # clap-ish snare, soft
            n=int(0.25*SR); tt=np.arange(n)/SR
            add(bp(rng.standard_normal(n),900,5000)*np.exp(-tt*22)*0.09,at)
    for h in range(2):
        n=int(0.06*SR); tt=np.arange(n)/SR
        add(hp(rng.standard_normal(n),7000)*np.exp(-tt*70)*(0.05 if h else 0.03),at+h*beat/2,0.8,1.2)
# sidechain duck from kicks
sc=np.ones(N)
for b in range(0,int(D/beat)+1,2):
    i=int(b*beat*SR); n=int(0.35*SR); j=min(N,i+n); sc[i:j]=np.minimum(sc[i:j],1-0.45*np.exp(-np.arange(j-i)/SR*10))
L*=sc; R*=sc
mus=np.stack([L,R]); mus*=np.minimum(1,t/1.2)*np.minimum(1,(D-t)/1.6)
# SFX
S=np.zeros((2,N))
def sfx(sig,at,pan=1.0):
    i=int(at*SR)
    if i>=N: return
    j=min(N,i+len(sig)); S[0,i:j]+=sig[:j-i]*(2-pan)/2*2; S[1,i:j]+=sig[:j-i]*pan/2*2
def click(g=0.25):
    n=int(0.05*SR); tt=np.arange(n)/SR
    return (bp(rng.standard_normal(n),2000,6000)*np.exp(-tt*180)+np.sin(2*np.pi*1800*tt)*np.exp(-tt*120)*0.5)*g
def whoosh(dur,up=True,g=0.22):
    n=int(dur*SR); tt=np.arange(n)/SR; x=rng.standard_normal(n); out=np.zeros(n); seg=1024
    for s0 in range(0,n,seg):
        fr=s0/n; fc=(400+5000*fr) if up else (5400-5000*fr)
        out[s0:s0+seg]=bp(x[max(0,s0-2048):s0+seg],fc*0.7,min(fc*1.4,20000))[-len(out[s0:s0+seg]):]
    return out*np.sin(np.pi*tt/dur)**2*g
def tick(f=2600,g=0.12):
    n=int(0.12*SR); tt=np.arange(n)/SR; return (np.sin(2*np.pi*f*tt)+0.3*np.sin(2*np.pi*f*2.01*tt))*np.exp(-tt*45)*g
def chime(g=0.13):
    n=int(1.6*SR); tt=np.arange(n)/SR; o=np.zeros(n)
    for k,m in enumerate([84,88,91]):
        d=int(k*0.07*SR); f=mf(m); x=(np.sin(2*np.pi*f*tt)+0.2*np.sin(2*np.pi*f*2.76*tt))*np.exp(-tt*3.2); o[d:]+=x[:n-d]
    return o*g
def pop(g=0.2):
    n=int(0.15*SR); tt=np.arange(n)/SR; f=300+900*np.exp(-tt*40)
    return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*28)*g
sfx(click(),2.52,1.1); sfx(whoosh(0.55,True),2.35); sfx(click(0.18),4.30,1.3); sfx(tick(),6.47,1.35)
sfx(chime(),10.40,1.3); sfx(click(0.18),10.72,0.7); sfx(whoosh(0.45,False,0.16),10.7)
sfx(click(),11.50,1.4); sfx(pop(),11.57); sfx(click(0.2),13.15,1.0); sfx(pop(0.22),13.22); sfx(tick(3200,0.08),13.32)
out=mus+S
out=out/np.max(np.abs(out))*0.89
w=wave.open('/workspace/audio/mix.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((out.T*32767).astype('<i2').tobytes()); w.close(); print('ok')
