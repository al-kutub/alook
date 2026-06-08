import type { NextConfig } from "next";
import path from "node:path";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
	// Prevent the bundler from creating duplicate copies of @better-auth/core,
	// which breaks AsyncLocalStorage-based request state (dual module hazard).
	// See: https://www.better-auth.com/docs/reference/faq#troubleshooting
	serverExternalPackages: ["@better-auth/core"],
	turbopack: {
		root: path.resolve(__dirname, "../.."),
	},
	pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
	async headers() {
		return [
			{
				// Blog pages - cache for 1 hour on CDN, 1 year on browser
				source: "/blog/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=3600, s-maxage=31536000",
					},
				],
			},
			{
				// Homepage and main pages - cache for 1 hour on CDN, 1 day on browser
				source: "/",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=3600, s-maxage=86400",
					},
				],
			},
			{
				// Static assets - cache for 1 year
				source: "/_next/static/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=31536000, immutable",
					},
				],
			},
			{
				// Images and media - cache for 1 month
				source: "/images/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=2592000",
					},
				],
			},
			{
				// Gallery - cache for 1 month
				source: "/gallery/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=2592000",
					},
				],
			},
			{
				// API routes - no cache
				source: "/api/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "no-store, no-cache, must-revalidate, proxy-revalidate",
					},
				],
			},
			{
				// Default for all other pages - cache for 1 hour
				source: "/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=3600, s-maxage=3600",
					},
				],
			},
		];
	},
};

const withMDX = createMDX({
	options: {
		remarkPlugins: ["remark-gfm"],
		rehypePlugins: [
			"rehype-slug",
			["rehype-autolink-headings", { behavior: "wrap" }],
			["rehype-external-links", { target: "_blank", rel: ["noopener", "noreferrer"] }],
			["rehype-pretty-code", { theme: { light: "vitesse-light", dark: "vitesse-dark" }, keepBackground: false }],
		],
	},
});

export default withMDX(nextConfig);

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
