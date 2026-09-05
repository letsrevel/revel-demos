#!/bin/sh
# =============================================================================
#  Seed the demo world. Runs inside the backend container, once, at first boot.
#  Mounted into the `bootstrap` service by docker-compose.yml.
# =============================================================================
#
#  Order matters:
#    1. migrate                — schema
#    2. bootstrap              — the standard demo world: a superuser, plus
#                                bootstrap_events + bootstrap_test_events +
#                                generate_test_jwts. This is what creates the
#                                @example.com accounts (password123) that the
#                                login page's demo picker lists, so it must
#                                run even if you only care about step 3.
#    3. bootstrap_demo_video   — the scenarios written for the demo videos
#                                (Shibari Circle Vienna, The Velvet Cellar,
#                                Sunday Slow Picnic Club, Analog Photo Walks,
#                                Paper Hearts Book Club).
#
#  Step 3 only exists in newer backend images. If the image you pulled does not
#  have it yet, this prints a loud warning and carries on rather than failing
#  the whole stack — bump REVEL_BACKEND_TAG in .env to get it.
#
#  Re-running is safe: seeding is skipped when the database already has demo
#  data, unless FORCE_RESEED=1.
#
set -eu

echo "==================================================================="
echo " Revel demo bootstrap"
echo "==================================================================="

echo "--> applying database migrations"
python manage.py migrate --noinput

# Has this database been seeded before? Ask it, rather than tracking state in a
# file — the answer belongs to the database volume, which is what `down -v`
# throws away.
SEEDED=$(python manage.py shell -c \
	"from django.contrib.auth import get_user_model as g; print('yes' if g().objects.filter(email='alice.owner@example.com').exists() else 'no')" \
	| tail -n 1)

if [ "${FORCE_RESEED:-0}" = "1" ] && [ "$SEEDED" = "yes" ]; then
	echo "--> FORCE_RESEED=1 — deleting existing demo data and starting over"
	python manage.py reset_events --no-input
	SEEDED="no"
fi

if [ "$SEEDED" = "yes" ]; then
	echo "--> database already seeded, skipping"
	echo "    (force a re-seed with:  FORCE_RESEED=1 docker compose run --rm bootstrap)"
else
	echo "--> seeding the standard demo world (this takes a minute)"
	python manage.py bootstrap
fi

echo "--> seeding the demo-video scenarios"
if python manage.py help bootstrap_demo_video >/dev/null 2>&1; then
	python manage.py bootstrap_demo_video
	echo "    done"
else
	echo ""
	echo "    ****************************************************************"
	echo "    *  WARNING: this backend image has no bootstrap_demo_video     *"
	echo "    *  command yet, so the demo-video scenarios were NOT seeded.   *"
	echo "    *                                                              *"
	echo "    *  Fix: edit .env, raise REVEL_BACKEND_TAG to a release that   *"
	echo "    *  includes it, then:                                          *"
	echo "    *      docker compose pull && docker compose up -d             *"
	echo "    *      npm run reseed                                          *"
	echo "    *                                                              *"
	echo "    *  Everything else still works — the standard demo accounts    *"
	echo "    *  are seeded, and demo scripts that build their own data      *"
	echo "    *  through the API are unaffected.                             *"
	echo "    ****************************************************************"
	echo ""
fi

echo "==================================================================="
echo " Ready.  Frontend http://localhost:5173   Mailpit http://localhost:8025"
echo " Demo accounts: alice.owner@example.com … / password123"
echo "==================================================================="
