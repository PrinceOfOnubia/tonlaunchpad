import { NextRequest, NextResponse } from "next/server";
import { buildMetadataId, buildMetadataUrl } from "@/lib/server/tokenMetadata";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      symbol?: string;
      description?: string;
      decimals?: number | string;
      imageUrl?: string | null;
      socials?: {
        website?: string;
        twitter?: string;
        telegram?: string;
        youtube?: string;
        tiktok?: string;
        github?: string;
      };
    };

    if (!body?.name || !body?.symbol) {
      return NextResponse.json(
        { message: "Token name and symbol are required." },
        { status: 400 },
      );
    }

    const id = buildMetadataId({
      name: body.name,
      symbol: body.symbol,
      description: body.description ?? "",
      decimals: body.decimals ?? 9,
      imageUrl: body.imageUrl ?? null,
      socials: body.socials,
    });
    const metadataUrl = buildMetadataUrl(id);

    return NextResponse.json(
      { metadataUrl, url: metadataUrl, uri: metadataUrl },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[metadata] publish failed", error);
    return NextResponse.json(
      { message: "Could not publish token metadata. Please try again." },
      { status: 500 },
    );
  }
}
