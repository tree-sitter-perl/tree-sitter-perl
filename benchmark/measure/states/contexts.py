#!/usr/bin/env python3
"""Which parse contexts the unmerged copies of large states belong to.

    contexts.py dump.txt [N]

Reads the output of the probed generator run with TSX_DUMP=1 (see README.md).
A "core" is a set of LR items; the generator builds one state per core and
lookahead context, then merges the copies it can.  Copies it could not merge
are the excess.  Per copy: number of states merged into it, its size, A when
it has '==' in its lookahead (after a term), S when it has 'abs' (start of a
term), END/and for those two tokens, then the symbols on the stack leading to
it.
"""
import collections,sys
st={};groups=collections.defaultdict(list)
for l in open(sys.argv[1]):
    p=l.rstrip('\n').split('\t')
    if p[0]=='DUMP': st[int(p[1])]=(int(p[2]),p[3]=='true',p[4]=='true',p[5]=='true',p[6]=='true',p[7].split())
    elif p[0]=='GROUP': groups[int(p[1])].append((int(p[2]),int(p[3])))
ctx=collections.Counter();ex={}
for core,gs in groups.items():
    big=[g for g in gs if st[g[0]][0]>64]
    if len(big)<2: continue
    seqs=[st[s][5] for s,_ in big]
    k=0
    while all(len(q)>k for q in seqs) and len({q[-1-k] for q in seqs})==1: k+=1
    for (sid,cnt),q in zip(big,seqs):
        sz,after,start,end,andd,_=st[sid]
        pre=' '.join(q[:len(q)-k][-3:]) or '(root)'
        key=(('A' if after else '-')+('S' if start else '-'),'END' if end else '---',pre)
        ctx[key]+=1; ex.setdefault(key,(core,sid))
for k,v in ctx.most_common(int(sys.argv[2]) if len(sys.argv)>2 else 30): print(v,k,ex[k])
