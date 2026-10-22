#!/bin/sh
# Passage de maintenance de nuit (corbeille, envois abandonnés, relances de
# webhooks), appelé par crond dans le conteneur `maintenance`.
wget -q -O /dev/null --header="Authorization: Bearer ${CRON_SECRET}" http://nuvora:3200/api/cron/maintenance
