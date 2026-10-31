"""Run with: python3 -m pipeline MAP_IMAGE --output OUTPUT_DIRECTORY."""
import argparse
import os
import sys
from pathlib import Path

from .map_pipeline import (
    PipelineError, diagram_to_graph, extract_diagram, load_image,
    read_diagram, write_artifacts, vision_model,
)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Map image → corridor diagram → graph JSON. No web frontend required.")
    parser.add_argument("map", type=Path, help="Single-floor PNG, JPG, or WebP image (up to 6 MB)")
    parser.add_argument("--output", "-o", type=Path, default=Path("pipeline/output"), help="Artifact directory (default: pipeline/output)")
    parser.add_argument("--diagram", type=Path, help="Use an existing/reviewed diagram JSON instead of calling image analysis")
    parser.add_argument("--model", default=vision_model(), help="Exact provider model ID (default: OPENAI_VISION_MODEL or DeepSeek-V4.1-Flash-B300)")
    parser.add_argument("--require-connected", action="store_true", help="Exit 2 after exporting review artifacts if the graph is disconnected")
    parser.add_argument("--overwrite", action="store_true", help="Explicitly replace existing output files")
    args = parser.parse_args(argv)
    try:
        # Catch an occupied output before spending an API request.
        if not args.overwrite and any((args.output / name).exists() for name in ("diagram.json", "diagram.svg", "overlay.svg", "graph.json")):
            raise PipelineError("Output files already exist. Choose a new directory or explicitly use --overwrite.")
        image = load_image(args.map)
        if args.diagram:
            diagram = read_diagram(args.diagram, image)
            extraction = {"method": "provided_diagram", "model": None}
            print("Using supplied diagram; image extraction was not run.")
        else:
            diagram = extract_diagram(image, os.environ.get("OPENAI_API_KEY", ""), args.model)
            extraction = {"method": "vision", "model": args.model}
        graph = diagram_to_graph(diagram, image, extraction)
        files = write_artifacts(args.output, diagram, graph, image, overwrite=args.overwrite)
        print(f'{len(diagram["places"])} places → {len(graph["nodes"])} graph nodes, {len(graph["edges"])} edges')
        for path in files:
            print(path.resolve())
        for warning in graph["warnings"]:
            print(f"Review: {warning}", file=sys.stderr)
        if args.require_connected and not graph["validation"]["connected"]:
            return 2
        return 0
    except (PipelineError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
