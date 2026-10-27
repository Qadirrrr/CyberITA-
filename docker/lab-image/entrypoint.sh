#!/bin/sh
# ============================================================
# CyberITA+ lab runtime entrypoint
# ------------------------------------------------------------
# 1. Seeds a small, clearly labelled demo syslog so the
#    log-analysis labs have something realistic to read on a
#    fresh container (rsyslog keeps appending afterwards).
# 2. Starts rsyslogd when available.
# 3. Hands control to the container command (usually sleep).
# ============================================================
set -eu

HOST="$(hostname)"
now() { date '+%b %e %H:%M:%S'; }
ago() { date -d "-$1 minutes" '+%b %e %H:%M:%S'; }

seed_logs() {
  mkdir -p /var/log
  # A fresh container has no log daemon, so the file is missing or empty.
  if [ ! -s /var/log/syslog ]; then
    {
      printf '%s %s kernel: [    0.000000] Linux version 5.15.0-cyberita (lab container, unprivileged)\n' "$(ago 42)" "$HOST"
      printf '%s %s systemd: Started Daily apt download activities.\n' "$(ago 41)" "$HOST"
      printf '%s %s CRON[412]: (root) CMD (/usr/lib/cron/run-parts --report /etc/cron.hourly)\n' "$(ago 30)" "$HOST"
      printf '%s %s sshd[531]: Accepted publickey for student from 10.0.0.4 port 51244 ssh2: RSA SHA256:labtraining\n' "$(ago 21)" "$HOST"
      printf '%s %s systemd-logind[288]: New session 1 of user student.\n' "$(ago 21)" "$HOST"
      printf '%s %s systemd: Started Session 1 of user student.\n' "$(ago 21)" "$HOST"
      printf '%s %s sudo: student : TTY=pts/0 ; PWD=/home/student ; USER=root ; COMMAND=/usr/bin/apt update\n' "$(ago 18)" "$HOST"
      printf '%s %s sshd[566]: Failed password for invalid user admin from 10.0.0.9 port 51302 ssh2\n' "$(ago 12)" "$HOST"
      printf '%s %s sshd[566]: pam_unix(sshd:auth): authentication failure; logname= uid=0 euid=0 tty=ssh ruser= rhost=10.0.0.9\n' "$(ago 12)" "$HOST"
      printf '%s %s systemd: Reloading.\n' "$(ago 7)" "$HOST"
      printf '%s %s CRON[702]: (student) CMD (cd /home/student && ls -la)\n' "$(ago 3)" "$HOST"
      printf '%s %s systemd-logind[288]: Removed session 1.\n' "$(ago 1)" "$HOST"
      printf '%s %s systemd: Started Session 2 of user student.\n' "$(now)" "$HOST"
    } > /var/log/syslog
  fi
  # Lab commands run as root inside the container; keep the demo log readable.
  chmod 0644 /var/log/syslog 2>/dev/null || true
  [ -d /home/student ] && chown -R student:student /home/student 2>/dev/null || true
}

seed_logs
mkdir -p /run /var/run
if command -v rsyslogd >/dev/null 2>&1; then
  rsyslogd 2>/dev/null || true
fi

exec "$@"
