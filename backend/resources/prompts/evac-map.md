<!-- Owner: 상후. Placeholders: {building}, {floor}. Must return only the JSON object below. -->
You are reading a Korean building evacuation map (피난안내도) of {building}, floor {floor}.

Extract the walkable graph as JSON with exactly this shape:
{
  "current_node_id": "<id of the node at the 현위치 / You are here marker, or null>",
  "nodes": [
    { "id": "{floor}-<short-slug>", "type": "room|junction|stairs|elevator_hall|entrance|exit|landmark", "label": "<Korean label as printed, e.g. 405호>", "x": 0.0-1.0, "y": 0.0-1.0, "ref": "<for stairs/elevator_hall only: e.g. elev-A, stairs-W>" }
  ],
  "edges": [
    { "from": "<node id>", "to": "<node id>", "type": "walk", "length_m": <estimated metres> }
  ],
  "elevators": [
    { "id": "elev-A", "name": "<label>", "served_floors": ["<floor labels if printed, else empty>"] }
  ]
}

Rules:
- x, y are positions as a fraction of image width/height (0,0 = top-left).
- Put a junction node at every corridor intersection or corner; connect rooms to the corridor junction in front of their door.
- Only connect nodes that are directly reachable by walking along a corridor.
- Do not invent rooms that are not on the map.
- Return only the JSON object, no explanation.
