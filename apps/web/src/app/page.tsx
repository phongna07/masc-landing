import { getHomeCountdownSettings, HOME_COUNTDOWN_CACHE_TAG } from "@masc-landing/api/home-countdown-settings";
import { unstable_cache } from "next/cache";
import { getLocale } from "next-intl/server";

import HomePageClient from "./home-page-client";

const getCachedHomeCountdownSettings = unstable_cache(
	getHomeCountdownSettings,
	[HOME_COUNTDOWN_CACHE_TAG],
	{ tags: [HOME_COUNTDOWN_CACHE_TAG], revalidate: 3600 },
);

export default async function Home() {
	const [settings, locale] = await Promise.all([getCachedHomeCountdownSettings(), getLocale()]);
	return <HomePageClient countdown={{
		openAt: settings.openAt,
		closeAt: settings.closeAt,
		copy: locale === "en" ? settings.en : settings.vi,
	}} />;
}
