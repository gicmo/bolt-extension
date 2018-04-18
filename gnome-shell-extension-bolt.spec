%global         uuid bolt@gnome.org

Name:           gnome-shell-extension-bolt
Version:        1
Release:        1%{?dist}
Summary:        Authorization agent for Thunderbolt 3 devices
License:        LGPLv2+
URL:            https://github.com/gicmo/bolt-extension
Source0:        %{url}/archive/v%{version}/%{name}-%{version}.tar.gz

BuildArch:      noarch

Requires:       gnome-shell-extension-common
Requires:       bolt

%description
This extension acts as the authorization agent for boltdb, the system
daemon of the bolt. It will automatically authorize new thunderbolt
devices if the user is logged in.

%prep
%setup -q -n %{name}-%{version}

%build
# as ninja would say, no work to do.

%install
mkdir -p %{buildroot}%{_datadir}/gnome-shell/extensions/%{uuid}
install -Dp -m 0644 {client.js,extension.js,metadata.json} \
  %{buildroot}%{_datadir}/gnome-shell/extensions/%{uuid}/

%files
%license COPYING
%doc README.md
%{_datadir}/gnome-shell/extensions/%{uuid}/

%changelog
* Wed Apr 18 2018 Christian Kellner <ckellner@redhat.com> - 1-1
- Initial build.

