import { NextRequest, NextResponse } from "next/server";
import { decodeMetadataId } from "@/lib/server/tokenMetadata";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const metadata = decodeMetadataId(id);
    return NextResponse.json(metadata, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[metadata] read failed", error);
    return NextResponse.json({ message: "Metadata not found" }, { status: 404 });
  }
}
