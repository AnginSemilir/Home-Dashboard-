#!/bin/bash
# Prints a JSON hassTokens blob for the frontend's localStorage.
B=http://127.0.0.1:8123; CID="$B/"
FID=$(curl -s -X POST $B/auth/login_flow -H 'Content-Type: application/json' -d "{\"client_id\":\"$CID\",\"handler\":[\"homeassistant\",null],\"redirect_uri\":\"$CID\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["flow_id"])')
CODE=$(curl -s -X POST $B/auth/login_flow/$FID -H 'Content-Type: application/json' -d "{\"client_id\":\"$CID\",\"username\":\"panel\",\"password\":\"panelpass123\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"])')
curl -s -X POST $B/auth/token -d "grant_type=authorization_code&code=$CODE&client_id=$CID" | python3 -c "
import json,sys,time; t=json.load(sys.stdin); t.update(hassUrl='$B', clientId='$CID', expires=int(time.time()*1000)+t['expires_in']*1000); print(json.dumps(t))"
