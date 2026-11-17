import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton, FavoriteButton } from "../../components/list-buttons";
import { priceLabel } from "../../components/listing-card";
import { getDictionary, getLocale } from "@/i18n/server";
import { findListing } from "@/lib/catalog";
import { formatPrice, isFuture } from "@/lib/listings";
import { getMember } from "@/lib/member";
import { createClient } from "@/lib/supabase/server";
import { deleteListing, setListingStatus } from "../actions";
import { setListingSuspended } from "../../admin/actions";
import { startCheckout } from "../../checkout/actions";
import { WEEKDAYS, todayIn, type Availability } from "@/lib/availability";
import { BidForm, ConfirmButton, Gallery, LocalTime, MessageForm, OfferForm, ReportForm, ReserveForm } from "./listing-actions";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// The seller's weekly hours, in their time zone.
function WeeklyHours({ availability, timeZone, locale, title, zoneNote }: {
  availability: Availability;
  timeZone: string;
  locale: string;
  title: string;
  zoneNote: string;
}) {
  const fmt = (min: number) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 1, 0, min)),
    );
  const day = (d: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + d)));
  return (
    <div className="border rounded-xl p-4 text-sm">
      <p className="font-medium mb-2">🕒 {title}</p>
      <dl className="space-y-1">
        {WEEKDAYS.filter((d) => availability[String(d)]).map((d) => (
          <div key={d} className="flex justify-between gap-3">
            <dt className="text-gray-600">{day(d)}</dt>
            <dd dir="ltr">{availability[String(d)].map(([a, b]) => `${fmt(a)} – ${fmt(b)}`).join(", ")}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-gray-500 mt-2">{zoneNote.replace("{zone}", timeZone.replace(/_/g, " "))}</p>
    </div>
  );
}

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { created, updated, pay } = await searchParams;
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const listing = await findListing(locale, id);
  if (!listing) notFound();

  const member = await getMember();
  const isOwner = Boolean(member && listing.sellerId === member.user.id);
  const isActive = !listing.status || listing.status === "active";
  const isAdmin = Boolean(member?.profile?.is_admin);
  // Suspended and removed listings are locked: their seller can only delete them.
  const isLocked = listing.status === "removed" || listing.status === "suspended";
  const money = (cents: number) => formatPrice(cents, listing.currency);
  const canAct = Boolean(member?.complete) && !isOwner && isActive;
  const fromDatabase = Boolean(listing.sellerId);

  // Online payment: can buyers pay this seller, and does this buyer have an accepted offer?
  let sellerPaid = false;
  let acceptedOfferId: string | null = null;
  if (fromDatabase && listing.sale && isActive && !isOwner) {
    const supabase = await createClient();
    const [{ data: ready }, offer] = await Promise.all([
      supabase.rpc("seller_accepts_payments", { p_seller: listing.sellerId }),
      member
        ? supabase
            .from("offers")
            .select("id")
            .eq("listing_id", listing.id)
            .eq("buyer_id", member.user.id)
            .eq("status", "accepted")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    sellerPaid = Boolean(ready);
    acceptedOfferId = (offer.data as { id: string } | null)?.id ?? null;
  }
  const payMessage = typeof pay === "string" ? (t.checkout.errors as Record<string, string>)[pay] : undefined;

  let bidCount = 0;
  if (listing.auction && fromDatabase) {
    const supabase = member?.supabase ?? (await createClient());
    const { count } = await supabase
      .from("bids")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", listing.id);
    bidCount = count ?? 0;
  }
  const auctionOpen = Boolean(listing.auction && isFuture(listing.auction.endsAt));
  const rentalUnit = listing.rental ? t.sell.units[listing.rental.unit] : "";

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full">
      <Link href="/browse" className="text-sm text-[#7A1E2B] hover:underline">
        {t.listing.back}
      </Link>

      {updated && (
        <p role="status" className="mt-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3">
          {t.sell.updated}
        </p>
      )}
      {created && (
        <p role="status" className="mt-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3">
          {t.sell.created}
        </p>
      )}
      {!isActive && listing.status && (
        <p className="mt-4 bg-gray-100 border rounded-lg p-3 text-gray-700">
          {t.listing.statusNote.replace("{status}", t.listing.statuses[listing.status as keyof typeof t.listing.statuses] ?? listing.status)}
          {isOwner && isLocked && <span className="block text-sm mt-1">{t.listing.lockedNote}</span>}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="relative">
          <Gallery images={listing.images} emoji={listing.emoji} title={listing.title} />
          <FavoriteButton
            id={listing.id}
            saveLabel={t.featured.save}
            savedLabel={t.featured.saved}
            className="absolute top-3 end-3 w-10 h-10"
          />
        </div>

        <div>
          <p className="text-sm text-gray-500 mb-1">
            <Link href={`/browse?category=${listing.category}`} className="hover:underline">
              {listing.categoryName ?? t.categories[listing.category]}
            </Link>
          </p>
          <h1 className="text-3xl font-bold mb-2">{listing.title}</h1>
          {listing.sellerUsername && (
            <p className="text-sm text-gray-600 mb-1">
              <Link href={`/seller/${listing.sellerUsername}`} className="hover:underline">
                {t.listing.by.replace("{username}", listing.sellerUsername)}
              </Link>
              {listing.reviews > 0 && (
                <span className="ms-2">
                  <span className="text-amber-500">★</span> {listing.rating.toFixed(1)} ({listing.reviews} {t.featured.reviews})
                </span>
              )}
            </p>
          )}
          {!listing.sellerUsername && listing.reviews > 0 && (
            <p className="text-gray-600 mb-2">
              ⭐ {listing.rating} ({listing.reviews} {t.featured.reviews})
            </p>
          )}

          {/* Prices for every way it's offered */}
          <dl className="space-y-1 mb-6">
            {!fromDatabase && <p className="text-3xl font-bold" dir="ltr">{priceLabel(listing, t)}</p>}
            {listing.sale && (
              <div className="flex items-baseline gap-2">
                <dt className="text-sm text-gray-500">{t.featured.buyNow}</dt>
                <dd className="text-3xl font-bold" dir="ltr">{money(listing.sale.priceCents)}</dd>
              </div>
            )}
            {listing.auction && (
              <div>
                <div className="flex items-baseline gap-2">
                  <dt className="text-sm text-gray-500">
                    {listing.auction.highestCents === null ? t.listing.startingBid : t.listing.currentBid}
                  </dt>
                  <dd className="text-2xl font-bold" dir="ltr">
                    {money(listing.auction.highestCents ?? listing.auction.startCents)}
                  </dd>
                </div>
                <p className="text-sm text-gray-600">
                  {fromDatabase && <>{t.listing.bidCount.replace("{n}", String(bidCount))} · </>}
                  {auctionOpen ? (
                    <>{t.listing.ends} <LocalTime iso={listing.auction.endsAt} locale={locale} /></>
                  ) : (
                    t.listing.ended
                  )}
                </p>
                {listing.auction.buyNowCents && (
                  <p className="text-sm text-gray-600">
                    {t.listing.buyNowPrice.replace("{amount}", money(listing.auction.buyNowCents))}
                  </p>
                )}
              </div>
            )}
            {listing.rental && (
              <div className="flex items-baseline gap-2">
                <dt className="text-sm text-gray-500">{t.featured.forRent}</dt>
                <dd className="text-2xl font-bold" dir="ltr">
                  {money(listing.rental.rateCents)} / {rentalUnit}
                </dd>
              </div>
            )}
            {listing.rental?.depositCents ? (
              <p className="text-sm text-gray-600">{t.listing.deposit.replace("{amount}", money(listing.rental.depositCents))}</p>
            ) : null}
            {listing.booking && (
              <div className="flex items-baseline gap-2">
                <dt className="text-sm text-gray-500">{t.browse.services}</dt>
                <dd className="text-2xl font-bold" dir="ltr">
                  {money(listing.booking.priceCents)}
                  {t.listing.perSession}
                </dd>
                <span className="text-sm text-gray-500">({t.sell.minutes.replace("{n}", String(listing.booking.sessionMinutes))})</span>
              </div>
            )}
          </dl>

          <div className="flex flex-col gap-3 mb-6">
            {listing.modes.includes("buy") && isActive && !isOwner && (
              <AddToCartButton
                id={listing.id}
                label={t.featured.addToCart}
                addedLabel={t.featured.inCart}
                className="py-3 font-medium"
              />
            )}

            {payMessage && (
              <p role={pay === "cancelled" ? "status" : "alert"} className={`rounded-lg p-3 text-sm border ${pay === "cancelled" ? "bg-gray-50 border-gray-200 text-gray-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                {payMessage}
              </p>
            )}
            {listing.sale && fromDatabase && isActive && !isOwner && (
              sellerPaid ? (
                <div className="border rounded-xl p-4 space-y-3">
                  {acceptedOfferId && <p className="text-sm text-green-700 font-medium">✅ {t.checkout.offerAccepted}</p>}
                  {listing.ships && (
                    <p className="text-sm text-gray-600">
                      🚚 {listing.shippingCents ? t.checkout.shippingCost.replace("{price}", money(listing.shippingCents)) : t.checkout.freeShipping}
                    </p>
                  )}
                  {member?.complete ? (
                    <form action={startCheckout}>
                      <input type="hidden" name="listing" value={listing.id} />
                      {acceptedOfferId && <input type="hidden" name="offer" value={acceptedOfferId} />}
                      <button type="submit" className="w-full bg-[#7A1E2B] text-white rounded-lg py-3 font-semibold">
                        {acceptedOfferId ? t.checkout.payOffer : t.checkout.buyNow}
                      </button>
                    </form>
                  ) : (
                    <Link href="/account" className="block text-center w-full bg-[#7A1E2B] text-white rounded-lg py-3 font-semibold">
                      {t.checkout.signInToBuy}
                    </Link>
                  )}
                  <p className="text-xs text-gray-500">🔒 {t.checkout.secure}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-600 border rounded-xl p-4">{t.checkout.sellerNotReady}</p>
              )
            )}
            {canAct && listing.auction && auctionOpen && (
              <BidForm
                listingId={listing.id}
                minAmount={listing.auction.minNextCents}
                minLabel={money(listing.auction.minNextCents)}
                text={t.listing}
              />
            )}
            {canAct && listing.sale?.acceptsOffers && <OfferForm listingId={listing.id} text={t.listing} />}
            {canAct && listing.rental && (
              <ReserveForm listingId={listing.id} mode="rental" text={t.listing} note={`${money(listing.rental.rateCents)} / ${rentalUnit}`} />
            )}
            {listing.booking?.availability && listing.booking.timeZone && (
              <WeeklyHours
                availability={listing.booking.availability}
                timeZone={listing.booking.timeZone}
                locale={locale}
                title={t.listing.hours}
                zoneNote={t.listing.hoursZone}
              />
            )}
            {canAct && listing.booking && (
              <ReserveForm
                listingId={listing.id}
                mode="booking"
                text={t.listing}
                note={t.sell.minutes.replace("{n}", String(listing.booking.sessionMinutes))}
                slots={
                  listing.booking.availability && listing.booking.timeZone
                    ? {
                        locale,
                        today: todayIn(listing.booking.timeZone),
                        lastDay: new Date(Date.parse(todayIn(listing.booking.timeZone) + "T00:00:00Z") + 90 * 86400000)
                          .toISOString()
                          .slice(0, 10),
                      }
                    : undefined
                }
              />
            )}
            {canAct && <MessageForm listingId={listing.id} text={t.listing} />}

            {fromDatabase && !member && (
              <div className="border rounded-xl p-4 bg-gray-50 text-sm">
                <p className="mb-3">{t.listing.signInToAct}</p>
                <Link href="/account" className="bg-[#7A1E2B] text-white px-4 py-2 rounded-lg inline-block">
                  {t.account.signIn}
                </Link>
              </div>
            )}
            {!fromDatabase && listing.modes.some((m) => m !== "buy") && (
              <p className="text-xs text-gray-500">{t.listing.actionSoon}</p>
            )}

            {isOwner && (
              <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
                <p className="font-medium">{t.listing.yourListing}</p>
                <div className="flex flex-wrap gap-2">
                  {!isLocked && (
                  <Link href={`/listing/${listing.id}/edit`} className="bg-[#7A1E2B] text-white rounded-lg px-3 py-2 text-sm">
                    ✏️ {t.listing.edit}
                  </Link>
                  )}
                  {listing.status !== "active" && !isLocked && (
                    <form action={setListingStatus}>
                      <input type="hidden" name="id" value={listing.id} />
                      <input type="hidden" name="status" value="active" />
                      <button className="border rounded-lg px-3 py-2 text-sm bg-white">{t.listing.activate}</button>
                    </form>
                  )}
                  {listing.status === "active" && (
                    <form action={setListingStatus}>
                      <input type="hidden" name="id" value={listing.id} />
                      <input type="hidden" name="status" value="paused" />
                      <button className="border rounded-lg px-3 py-2 text-sm bg-white">{t.listing.pause}</button>
                    </form>
                  )}
                  {listing.status !== "sold" && !isLocked && (
                    <form action={setListingStatus}>
                      <input type="hidden" name="id" value={listing.id} />
                      <input type="hidden" name="status" value="sold" />
                      <button className="border rounded-lg px-3 py-2 text-sm bg-white">{t.listing.markSold}</button>
                    </form>
                  )}
                  <form action={deleteListing}>
                    <input type="hidden" name="id" value={listing.id} />
                    <ConfirmButton
                      message={t.listing.deleteConfirm}
                      className="border border-red-300 text-red-700 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      {t.listing.delete}
                    </ConfirmButton>
                  </form>
                </div>
                <Link href="/account/selling" className="text-sm text-[#7A1E2B] hover:underline">
                  {t.listing.manage}
                </Link>
              </div>
            )}

            {isAdmin && fromDatabase && !isOwner && (listing.status === "active" || listing.status === "suspended") && (
              <div className="border border-gray-900 rounded-xl p-4 mt-4 space-y-2" dir="ltr">
                <p className="font-medium text-sm">🛡️ Admin</p>
                <form action={setListingSuspended}>
                  <input type="hidden" name="id" value={listing.id} />
                  <input type="hidden" name="suspended" value={listing.status === "active" ? "true" : "false"} />
                  <ConfirmButton
                    message={listing.status === "active" ? "Suspend this listing? It will be hidden from buyers until you unsuspend it." : "Unsuspend this listing and make it active again?"}
                    className={listing.status === "active" ? "border border-red-300 text-red-700 rounded-lg px-3 py-1.5 text-sm" : "border rounded-lg px-3 py-1.5 text-sm"}
                  >
                    {listing.status === "active" ? "Suspend listing" : "Unsuspend listing"}
                  </ConfirmButton>
                </form>
                {listing.sellerId && (
                  <a href={`/admin/members/${listing.sellerId}`} className="text-sm underline">View seller in admin</a>
                )}
              </div>
            )}
          </div>

          {listing.description && (
            <>
              <h2 className="font-semibold mb-1">{t.listing.description}</h2>
              <p className="text-gray-700 mb-4 whitespace-pre-line">{listing.description}</p>
            </>
          )}
          {listing.condition && listing.condition !== "not_applicable" && (
            <p className="text-sm text-gray-700 mb-2">
              <span className="font-semibold">{t.sell.condition}:</span>{" "}
              {t.sell.conditions[listing.condition as keyof typeof t.sell.conditions] ?? listing.condition}
            </p>
          )}
          {listing.refundPolicy && (
            <p className="text-sm text-gray-700 mb-2">
              <span className="font-semibold">{t.listing.refunds}:</span>{" "}
              {listing.refundPolicy === "refundable"
                ? t.listing.refundsAccepted.replace("{n}", String(listing.refundDays ?? 14))
                : t.listing.noRefunds}
            </p>
          )}
          {listing.attributes?.homemade === true && (
            <p className="text-sm text-gray-700 mb-2">🏠 {t.listing.homemadeNotice}</p>
          )}
          {typeof listing.attributes?.allergens === "string" && (
            <p className="text-sm text-gray-700 mb-2">
              <span className="font-semibold">{t.listing.allergens}:</span> {listing.attributes.allergens}
            </p>
          )}
          {listing.location && (
            <>
              <h2 className="font-semibold mb-1 mt-4">{t.listing.location}</h2>
              <p className="text-gray-700" dir="ltr">📍 {listing.location}</p>
            </>
          )}
          {(listing.localPickup || listing.ships) && fromDatabase && !listing.booking && (
            <p className="text-sm text-gray-600 mt-1">
              {[listing.localPickup && t.sell.localPickup, listing.ships && t.sell.ships].filter(Boolean).join(" · ")}
            </p>
          )}

          {member?.complete && !isOwner && fromDatabase && (
            <div className="mt-6">
              <ReportForm listingId={listing.id} text={t.listing} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
