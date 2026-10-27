# syntax=docker/dockerfile:1
# ============================================================
# CyberITA+ lab runtime image
# ------------------------------------------------------------
# Default image for real hands-on labs (LAB_DOCKER_IMAGE).
# It ships the everyday Linux tooling the labs expect
# (ss, ip, free, ps, curl, ...), a `student` user (UID 1000),
# demo system logs for the log-analysis labs and an honest
# `systemctl` shim, because labs run in containers without
# systemd.
#
# Learners get a real terminal: their session runs as root
# inside this disposable container (with their own name in
# /etc/passwd), so they can install any package with apt.
# The container is still isolated from the host: no
# --privileged, no host mounts, no Docker socket, and
# CPU/memory/process limits. That is why the apt package
# lists are kept in the image - `apt-get install` works
# immediately, even before `apt-get update`.
#
# Build:  npm run lab:image:build        (from /server)
# See:    docs/LABS.md
# ============================================================
FROM ubuntu:22.04

LABEL org.opencontainers.image.title="CyberITA+ lab runtime" \
      org.opencontainers.image.description="Isolated training shell for CyberITA+ hands-on labs" \
      maintainer="CyberITA+"

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# Tooling used by the lab steps. Keep this list in sync with
# docs/LABS.md when labs start relying on new commands.
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      dnsutils \
      file \
      git \
      iproute2 \
      iputils-ping \
      jq \
      less \
      lsof \
      man-db \
      nano \
      net-tools \
      netcat-openbsd \
      nmap \
      openssh-client \
      postgresql-client \
      procps \
      python3 \
      python3-pip \
      rsyslog \
      sudo \
      traceroute \
      tree \
      unzip \
      util-linux \
      vim-tiny \
      wget \
      whois \
      zip \
    && apt-get clean \
    && rm -rf /var/cache/apt/archives/*.deb

# Keep package installs in the live container non-interactive.
RUN printf '%s\n' \
      'APT::Get::Assume-Yes "true";' \
      'Dpkg::Options { "--force-confdef"; "--force-confold"; };' \
      'Acquire::Retries "3";' \
      > /etc/apt/apt.conf.d/99-cyberita-lab

# Dedicated unprivileged lab user. The image also uses it for the shared
# home directory; the provider creates a per-session root identity with the
# learner's own name on top of this.
RUN groupadd --gid 1000 student \
    && useradd --uid 1000 --gid student --create-home --shell /bin/bash --groups adm student \
    && printf 'student:student\n' | chpasswd \
    && mkdir -p /home/student/notes /home/student/scripts \
    && chown -R student:student /home/student \
    && echo 'student ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/student \
    && chmod 0440 /etc/sudoers.d/student

# systemctl cannot work without systemd; give learners the authentic
# container message instead of "command not found".
COPY systemctl-shim /usr/local/bin/systemctl
COPY entrypoint.sh /usr/local/bin/cyberita-entrypoint.sh
RUN chmod 0755 /usr/local/bin/systemctl /usr/local/bin/cyberita-entrypoint.sh

WORKDIR /home/student

# The entrypoint seeds demo logs, starts rsyslogd and then executes the
# command passed by the provider (`sleep infinity` for lab containers).
ENTRYPOINT ["/usr/local/bin/cyberita-entrypoint.sh"]
CMD ["sleep", "infinity"]
