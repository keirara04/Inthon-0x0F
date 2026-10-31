<?php

namespace App\Http\Controllers;

use App\Services\EvacMapParser;
use App\Services\GraphImporter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class GraphController extends Controller
{
    /**
     * PUT /api/graph (header X-Admin-Token) — save one floor in the shared contract shape.
     * Replaces the floor's nodes wholesale, so overwriting a verified floor needs "replace": true.
     */
    public function save(Request $request, GraphImporter $importer)
    {
        $token = config('services.admin_token');
        abort_unless($token && hash_equals($token, (string) $request->header('X-Admin-Token')), 401, 'Admin token required');

        $data = $request->validate([
            'building' => 'required|string|max:100',
            'floor' => ['required', 'string', 'regex:/^(B\d+|\d+F)$/'],
            'status' => 'required|in:draft,verified',
            'replace' => 'boolean',
            'nodes' => 'required|array|min:1',
            'nodes.*.id' => ['required', 'string', 'distinct', 'starts_with:'.$request->input('floor').'-'],
            'nodes.*.type' => ['required', Rule::in(EvacMapParser::NODE_TYPES)],
            'nodes.*.label' => 'required|string|max:100',
            'nodes.*.x' => 'required|numeric|between:0,1',
            'nodes.*.y' => 'required|numeric|between:0,1',
            'nodes.*.ref' => 'nullable|string|max:50',
            'edges' => 'present|array',
            'edges.*.from' => ['required', Rule::in(collect($request->input('nodes'))->pluck('id'))],
            'edges.*.to' => ['required', Rule::in(collect($request->input('nodes'))->pluck('id'))],
            'edges.*.type' => 'in:walk',
            'edges.*.length_m' => 'nullable|numeric|min:0',
            'edges.*.heading_deg' => 'nullable|numeric|between:0,360',
            'elevators' => 'array',
            'elevators.*.id' => 'required|string|max:50',
            'elevators.*.name' => 'required|string|max:100',
            'elevators.*.served_floors' => 'required|array',
        ]);

        $existing = DB::table('floors')->join('buildings', 'buildings.id', '=', 'floors.building_id')
            ->where('buildings.name', $data['building'])->where('floors.label', $data['floor'])->value('floors.status');
        abort_if($existing === 'verified' && ! ($data['replace'] ?? false), 409, '이미 검수된 층이에요. 덮어쓰려면 replace: true');

        $buildingId = $importer->importFloor($data);
        $importer->linkFloors($buildingId);

        return response()->json(['data' => ['building' => $data['building'], 'floor' => $data['floor'], 'status' => $data['status']]]);
    }
}
