#!/bin/sh
sed -i 's/^AllowTcpForwarding no/AllowTcpForwarding yes/' /config/sshd/sshd_config 2>/dev/null
sed -i 's/^GatewayPorts no/GatewayPorts yes/' /config/sshd/sshd_config 2>/dev/null
