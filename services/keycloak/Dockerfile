FROM quay.io/keycloak/keycloak:26.1.4 AS builder

ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=true

COPY realm-import /opt/keycloak/data/import

RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.1.4

ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=true \
    KC_HTTP_ENABLED=true \
    KC_PROXY_HEADERS=xforwarded

COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY --chmod=0755 start.sh /opt/keycloak/start.sh

ENTRYPOINT ["/opt/keycloak/start.sh"]
