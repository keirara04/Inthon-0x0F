<?php

namespace App\Http\Controllers;

use App\Http\Resources\RouteResource;
use App\Http\Resources\SearchResultResource;
use App\Services\RouteService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NavigationController extends Controller
{
    /** GET /api/search?q=우정정보관 405 — every word must match a node label or building name. */
    public function search(Request $request)
    {
        $request->validate(['q' => 'required|string|max:100']);

        $query = DB::table('nodes')
            ->join('floors', 'floors.id', '=', 'nodes.floor_id')
            ->join('buildings', 'buildings.id', '=', 'floors.building_id')
            ->where('floors.status', 'verified')
            ->where('nodes.type', '!=', 'junction')
            ->select('nodes.id', 'nodes.label', 'nodes.type', 'floors.label as floor', 'buildings.name as building');

        foreach (preg_split('/\s+/', trim($request->query('q'))) as $word) {
            $query->where(fn ($q) => $q->where('nodes.label', 'like', "%{$word}%")
                ->orWhere('buildings.name', 'like', "%{$word}%"));
        }

        return SearchResultResource::collection($query->orderBy('floors.level')->orderBy('nodes.label')->limit(20)->get());
    }

    /**
     * GET /api/start-points?building=우정정보관: places someone can start from (entrances, exits, elevator halls,
     * stairs) on verified floors, grouped by floor bottom-up. Feeds "다른 입구에 계신가요?".
     */
    public function startPoints(Request $request)
    {
        $request->validate(['building' => 'required|string|max:100']);

        $rows = DB::table('nodes')
            ->join('floors', 'floors.id', '=', 'nodes.floor_id')
            ->join('buildings', 'buildings.id', '=', 'floors.building_id')
            ->where('buildings.name', $request->query('building'))
            ->where('floors.status', 'verified')
            ->whereIn('nodes.type', self::START_TYPES)
            ->orderBy('floors.level')
            ->get(['nodes.id', 'nodes.label', 'nodes.type', 'floors.label as floor']);

        $data = $rows->groupBy('floor')->map(fn ($points, $floor) => [
            'floor' => $floor,
            'points' => $points
                ->sortBy(fn ($p) => [array_search($p->type, self::START_TYPES), $p->label])
                ->map(fn ($p) => ['id' => $p->id, 'label' => $p->label, 'type' => $p->type])
                ->values(),
        ])->values();

        return ['data' => $data];
    }

    private const START_TYPES = ['entrance', 'exit', 'elevator_hall', 'stairs'];

    /** POST /api/route {start_node, dest_node} */
    public function route(Request $request, RouteService $routes)
    {
        $data = $request->validate([
            'start_node' => 'required|string|exists:nodes,id',
            'dest_node' => 'required|string|exists:nodes,id',
        ]);

        $route = $routes->route($data['start_node'], $data['dest_node']);
        abort_if($route === null, 422, '경로를 찾을 수 없어요');

        return new RouteResource($route);
    }
}
