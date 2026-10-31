<?php
// Run from this snapshot's backend directory with its isolated SQLite env.
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['app.debug' => false]); // Keep stack traces out of shareable results.
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

function probe(string $name, string $method, string $url, array $data = [], array $files = []): array {
    global $kernel;
    $request = Illuminate\Http\Request::create($url, $method, $files ? $data : [], [], $files,
        ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => $files ? 'multipart/form-data' : 'application/json'],
        $files ? null : json_encode($data));
    $response = $kernel->handle($request);
    $json = json_decode($response->getContent(), true);
    $record = ['case' => $name, 'status' => $response->getStatusCode(), 'body' => $json];
    echo json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES).PHP_EOL;
    $kernel->terminate($request, $response);
    return $record;
}

probe('ping', 'GET', '/api/ping');
probe('search-405', 'GET', '/api/search?q=405');
probe('lobby-to-405', 'POST', '/api/route', ['start_node'=>'1F-lobby','dest_node'=>'4F-405']);
probe('405-to-401-expected-second-trip', 'POST', '/api/route', ['start_node'=>'4F-405','dest_node'=>'4F-401']);
probe('same-location', 'POST', '/api/route', ['start_node'=>'1F-lobby','dest_node'=>'1F-lobby']);
probe('invalid-node', 'POST', '/api/route', ['start_node'=>'missing','dest_node'=>'4F-405']);
probe('empty-search', 'GET', '/api/search?q=');
probe('missing-upload', 'POST', '/api/evac-map/parse', ['building'=>'우정정보관','floor'=>'1F']);
if (!config('services.openrouter.key')) {
    probe('vision-key-not-configured', 'POST', '/api/evac-map/parse', ['building'=>'우정정보관','floor'=>'2F'],
        ['image'=>new Illuminate\Http\UploadedFile('/Users/myeongseong/Downloads/IMG_4965 Medium.jpeg','map.jpg','image/jpeg',null,true)]);
}
probe('missing-checkpoint-photo', 'POST', '/api/checkpoint', ['expected_node'=>'4F-405']);
probe('graph-without-admin-token', 'PUT', '/api/graph');
// This transaction rolls back; no test state is left in the snapshot database.
Illuminate\Support\Facades\DB::beginTransaction();
try {
    Illuminate\Support\Facades\DB::table('floors')->where('label','4F')->update(['status'=>'draft']);
    probe('draft-destination', 'POST', '/api/route', ['start_node'=>'1F-lobby','dest_node'=>'4F-405']);
    probe('draft-self-route', 'POST', '/api/route', ['start_node'=>'4F-405','dest_node'=>'4F-405']);
} finally {
    Illuminate\Support\Facades\DB::rollBack();
}
