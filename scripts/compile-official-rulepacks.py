#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compile the two official 3.0 XLSX workbooks into browser/Node-friendly JS rule packs.
Uses only Python stdlib to read OOXML so the repo does not need an Excel runtime dependency.
"""
from pathlib import Path
import zipfile, xml.etree.ElementTree as ET, re, json, hashlib, sys

ROOT=Path(__file__).resolve().parents[1]
DRG=ROOT/'rulesets/official-source/按病组（DRG）付费3.0版分组方案配置信息.xlsx'
DIP=ROOT/'rulesets/official-source/按病种分值（DIP）付费3.0版分组方案.xlsx'
OUT=ROOT/'app/p1/rules/compiled'
OUT.mkdir(parents=True, exist_ok=True)
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PKG='{http://schemas.openxmlformats.org/package/2006/relationships}'

def sha256(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
 return h.hexdigest()

def col_index(ref):
 m=re.match(r'([A-Z]+)',ref); n=0
 for ch in m.group(1): n=n*26+ord(ch)-64
 return n-1

def read_xlsx(path):
 with zipfile.ZipFile(path) as z:
  shared=[]
  if 'xl/sharedStrings.xml' in z.namelist():
   for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(NS+'si'):
    shared.append(''.join(t.text or '' for t in si.iter(NS+'t')))
  wb=ET.fromstring(z.read('xl/workbook.xml'))
  rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
  relmap={r.attrib['Id']:r.attrib['Target'] for r in rels.findall(PKG+'Relationship')}
  result={}
  for sh in wb.find(NS+'sheets').findall(NS+'sheet'):
   target='xl/'+relmap[sh.attrib[REL+'id']]
   root=ET.fromstring(z.read(target)); rows=[]
   for row in root.find(NS+'sheetData').findall(NS+'row'):
    vals={}
    for c in row.findall(NS+'c'):
     idx=col_index(c.attrib['r']); t=c.attrib.get('t'); v=c.find(NS+'v'); val=''
     if v is not None:
      raw=v.text or ''
      val=shared[int(raw)] if t=='s' and raw else raw
     else:
      inline=c.find(NS+'is')
      if inline is not None: val=''.join(x.text or '' for x in inline.iter(NS+'t'))
     vals[idx]=val
    maxcol=max(vals.keys(),default=-1)
    rows.append([vals.get(i,'') for i in range(maxcol+1)])
   result[sh.attrib['name']]=rows
  return result

def at(row,i): return row[i].strip() if i<len(row) and isinstance(row[i],str) else (row[i] if i<len(row) else '')
def as_int(x):
 try:return int(float(str(x)))
 except:return None

def clean_formula(s):
 return str(s or '').replace('_x000D_','').replace('\r','').strip()

def compile_drg():
 r=read_xlsx(DRG)
 mdc=[]
 for i,row in enumerate(r['MDC'][2:], start=3):
  code=at(row,0)
  if not code or code=='0000': continue
  mdc.append({'code':code,'name':at(row,1),'rule':clean_formula(at(row,2)),'sort':as_int(at(row,3)),'sourceRow':i})
 adrg=[]
 for i,row in enumerate(r['ADRG'][1:], start=2):
  code=at(row,1)
  if not code or code=='000': continue
  adrg.append({'code':code,'name':at(row,2),'rule':clean_formula(at(row,3)),'mdc':at(row,4),'sort':as_int(at(row,5)),'sourceRow':i})
 drgs=[]
 for i,row in enumerate(r['DRG'][1:], start=2):
  code=at(row,0)
  if not code or code=='0000': continue
  drgs.append({'code':code,'name':at(row,1),'rule':clean_formula(at(row,2)),'adrg':at(row,3),'mdc':at(row,4),'sort':as_int(at(row,5)),'sourceRow':i})
 sets={}
 for row in r['集合'][1:]:
  sid=at(row,0); code=at(row,1)
  if sid and code: sets.setdefault(sid,[]).append(code)
 cc={}
 for row in r['CC'][1:]:
  code=at(row,0)
  if code: cc[code]={'name':at(row,1),'exclusion':at(row,2),'type':at(row,3)}
 exclusions={}
 for row in r['排除表'][1:]:
  eid=at(row,0); code=at(row,1)
  if eid and code: exclusions.setdefault(eid,[]).append(code)
 return {
  'id':'nhsa-drg-3.0-official-workbook','version':'DRG-3.0','sourceFile':DRG.name,'sha256':sha256(DRG),
  'counts':{'mdc':len(mdc),'adrg':len(adrg),'drg':len(drgs),'setRows':sum(len(v) for v in sets.values()),'cc':len(cc),'exclusionRows':sum(len(v) for v in exclusions.values())},
  'mdc':mdc,'adrg':adrg,'drg':drgs,'sets':sets,'cc':cc,'exclusions':exclusions
 }

def split_codes(s): return [x.strip() for x in str(s or '').split('|') if x.strip()]
def rule_row(sheet,rownum,row,kind):
 base={'kind':kind,'sourceSheet':sheet,'sourceRow':rownum}
 if kind=='PRE':
  base.update({'category':at(row,0),'seq':at(row,1),'name':at(row,2),'principalDiagnosis':split_codes(at(row,3)),'principalDiagnosisName':at(row,4),'principalProcedure':split_codes(at(row,5)),'principalProcedureName':at(row,6),'note':at(row,7)})
 elif kind=='MERGE':
  base.update({'category':at(row,0),'seq':at(row,1),'principalDiagnosis':split_codes(at(row,2)),'principalDiagnosisName':at(row,3),'principalProcedure':split_codes(at(row,4)),'principalProcedureName':at(row,5),'relatedProcedure':split_codes(at(row,6)),'relatedProcedureName':at(row,7)})
 elif kind=='BURN':
  base.update({'category':at(row,0),'seq':at(row,1),'principalDiagnosis':split_codes(at(row,2)),'burnDegree':at(row,3),'secondaryDiagnosis':split_codes(at(row,4)),'burnArea':at(row,5),'principalProcedure':split_codes(at(row,6)),'principalProcedureName':at(row,7),'relatedProcedure':split_codes(at(row,8)),'relatedProcedureName':at(row,9)})
 elif kind=='TUMOR':
  base.update({'category':at(row,0),'seq':at(row,1),'principalDiagnosis':split_codes(at(row,2)),'principalDiagnosisName':at(row,3),'secondaryDiagnosis':split_codes(at(row,4)),'secondaryDiagnosisName':at(row,5),'procedureExpression':at(row,6),'procedureName':at(row,7)})
 elif kind=='TB':
  base.update({'category':at(row,0),'seq':at(row,1),'principalDiagnosis':split_codes(at(row,2)),'principalDiagnosisName':at(row,3),'principalProcedure':split_codes(at(row,4)),'principalProcedureName':at(row,5),'drugResistant':at(row,6),'drugResistantRule':at(row,7)})
 elif kind=='BASE':
  base.update({'category':at(row,0),'seq':at(row,1),'principalDiagnosis':split_codes(at(row,2)),'principalDiagnosisName':at(row,3),'principalProcedure':split_codes(at(row,4)),'principalProcedureName':at(row,5)})
 return base

def compile_dip():
 r=read_xlsx(DIP)
 pre=[rule_row('一、先期分组',i,row,'PRE') for i,row in enumerate(r['一、先期分组'][3:],start=4) if at(row,0)]
 merge=[rule_row('二、并项规则下的核心病种',i,row,'MERGE') for i,row in enumerate(r['二、并项规则下的核心病种'][2:],start=3) if at(row,0)]
 burn=[rule_row('三、诊断辅助细分-烧伤类病种',i,row,'BURN') for i,row in enumerate(r['三、诊断辅助细分-烧伤类病种'][3:],start=4) if at(row,0)]
 tumor=[rule_row('三、诊断辅助细分-肿瘤类病种',i,row,'TUMOR') for i,row in enumerate(r['三、诊断辅助细分-肿瘤类病种'][2:],start=3) if at(row,0)]
 tb=[rule_row('三、诊断辅助细分-结核类病种',i,row,'TB') for i,row in enumerate(r['三、诊断辅助细分-结核类病种'][2:],start=3) if at(row,0)]
 resistant=[{'code':at(row,0),'name':at(row,1)} for row in r['附表—结核耐药诊断'][2:] if at(row,0)]
 base=[rule_row('四、基础规则下的核心病种',i,row,'BASE') for i,row in enumerate(r['四、基础规则下的核心病种'][2:],start=3) if at(row,0)]
 excluded_diag=[{'code':at(row,0),'name':at(row,1),'sourceRow':i} for i,row in enumerate(r['五、不纳入分组的主要诊断'][3:],start=4) if at(row,0)]
 excluded_proc=[{'code':at(row,0),'name':at(row,1),'note':at(row,2),'sourceRow':i} for i,row in enumerate(r['五、不纳入分组的主要手术操作'][2:],start=3) if at(row,0)]
 primary=[{'seq':at(row,0),'principalDiagnosis':split_codes(at(row,1)),'principalDiagnosisName':at(row,2),'principalProcedure':split_codes(at(row,3)),'principalProcedureName':at(row,4),'sourceRow':i} for i,row in enumerate(r['六、基层病种'][2:],start=3) if at(row,0)]
 return {
  'id':'nhsa-dip-3.0-official-workbook','version':'DIP-3.0','sourceFile':DIP.name,'sha256':sha256(DIP),
  'counts':{'pre':len(pre),'merge':len(merge),'burn':len(burn),'tumor':len(tumor),'tb':len(tb),'tbResistantDiagnosis':len(resistant),'base':len(base),'excludedDiagnosis':len(excluded_diag),'excludedProcedure':len(excluded_proc),'primaryCare':len(primary)},
  'pre':pre,'merge':merge,'burn':burn,'tumor':tumor,'tb':tb,'tbResistantDiagnosis':resistant,'base':base,'excludedDiagnosis':excluded_diag,'excludedProcedure':excluded_proc,'primaryCare':primary
 }

def write_module(path,var,obj):
 txt='// AUTO-GENERATED by scripts/compile-official-rulepacks.py; do not hand-edit.\nexport const '+var+' = '+json.dumps(obj,ensure_ascii=False,separators=(',',':'))+';\n'
 path.write_text(txt,encoding='utf-8')
 print(path, len(txt), 'bytes')

write_module(OUT/'drg3-official.js','DRG3_OFFICIAL',compile_drg())
write_module(OUT/'dip3-official.js','DIP3_OFFICIAL',compile_dip())
