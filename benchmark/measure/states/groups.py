#!/usr/bin/env python3
"""The cores that survive minimizing as several large states.

    groups.py dump.txt [top N | hist]

Reads the output of the probed generator run with TSX_DUMP=1 (see README.md).
A "core" is a set of LR items; the generator builds one state per core and
lookahead context, then merges the copies it can.  Copies it could not merge
are the excess.  Per copy: number of states merged into it, its size, A when
it has '==' in its lookahead (after a term), S when it has 'abs' (start of a
term), END/and for those two tokens, then the symbols on the stack leading to
it.
"""
import sys,collections
st={};groups=collections.defaultdict(list)
for l in open(sys.argv[1]):
    p=l.rstrip('\n').split('\t')
    if p[0]=='DUMP': st[int(p[1])]=(int(p[2]),p[3]=='true',p[4]=='true',p[5]=='true',p[6]=='true',p[7])
    elif p[0]=='GROUP': groups[int(p[1])].append((int(p[2]),int(p[3])))
tot=0;rows=[]
for core,gs in groups.items():
    big=[g for g in gs if st[g[0]][0]>64]
    if len(big)>1: rows.append((len(big)-1,core,big)); tot+=len(big)-1
print('excess large groups',tot,'cores',len(rows))
mode=sys.argv[2] if len(sys.argv)>2 else 'top'
if mode=='top':
    for n,core,big in sorted(rows,reverse=True)[:int(sys.argv[3]) if len(sys.argv)>3 else 6]:
        print('== core',core,'groups',n+1)
        for sid,cnt in big:
            sz,after,start,end,andd,seq=st[sid]
            print('   ',cnt,'sz',sz,'A' if after else '-','S' if start else '-','END' if end else '---','and' if andd else '---','|',seq[-90:])
else:
    # histogram of signature patterns across groups
    c=collections.Counter()
    for n,core,big in rows:
        sig=tuple(sorted(collections.Counter((('A' if st[s][1] else '-')+('S' if st[s][2] else '-'),st[s][3],st[s][4]) for s,_ in big).items()))
        c[sig]+=n
    for k,v in c.most_common(25): print(v,k)
