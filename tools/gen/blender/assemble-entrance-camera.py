#!/usr/bin/env python3
# @doc Assemble exported entrance car samples and Blender camera controls.
"""Assemble unchanged authored car samples and saved-Blend camera export.
Review sandbox only. Does not author, synthesize or edit numeric camera controls.
"""
import argparse, hashlib, json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--curves-js',required=True);p.add_argument('--camera-json',required=True);p.add_argument('--output-js',required=True);p.add_argument('--receipt',required=True);a=p.parse_args()
curves=Path(a.curves_js); camera=Path(a.camera_json); output=Path(a.output_js)
s=curves.read_text();start=s.index('Object.freeze(')+len('Object.freeze(');data,n=json.JSONDecoder().raw_decode(s[start:]);end=start+n
if 'camera' in data:raise ValueError('Use the base car-curves export, not an already assembled camera payload')
if data.get('version')!=1 or data.get('columns')!=['x','z','yaw','wheelRoll','steer','heave','pitch']:raise ValueError('Unexpected car curve schema')
proposal=json.loads(camera.read_text()); authored=proposal['camera']
if authored.get('version')!=1 or not authored.get('segments'):raise ValueError('Unexpected saved-camera export schema')
data['camera']=authored
output.write_text(s[:start]+json.dumps(data,separators=(',',':'))+s[end:])
h=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
Path(a.receipt).write_text(json.dumps({'status':'review-sandbox-assembly','baseCurvesSHA256':h(curves),'cameraExportSHA256':h(camera),'cameraEditableSourceSHA256':proposal.get('editableSourceSHA256'),'assembledJS_SHA256':h(output),'note':'Camera controls copied unchanged from saved-Blend F-curve export; car numeric samples unchanged'},indent=2)+'\n')
