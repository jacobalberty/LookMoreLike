// Command simdevice plays a UniFi device against a beenfard, one inform per
// run, for the end-to-end tests. It keeps the device's key in a state file
// between runs, as a real device keeps it in flash:
//
//	simdevice -url http://127.0.0.1:8080 -mac de:ad:be:ef:00:01 -state dev.json
//
// A device with no state uses UniFi's default key, which is what a new or
// factory-reset device does. When the controller adopts it, its reply is a
// setparam carrying a new key, which simdevice stores and uses from then on.
// -key makes the device use a key the controller does not know (a device
// still managed by another controller). The result is one JSON line:
// {"status":200,"type":"noop","key":"default"|"adopted"|"given"}.
// A setdefault reply (the controller forgetting the device) makes the device
// factory reset itself: it deletes its stored key, so the next run informs
// with the default key.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/jacobalberty/go-unifi/inform"
)

type state struct {
	Key        string `json:"key,omitempty"` // hex; empty means the default key
	CfgVersion string `json:"cfgversion,omitempty"`
}

type result struct {
	Status int    `json:"status"`
	Type   string `json:"type,omitempty"`
	Key    string `json:"key"`
}

func main() {
	if err := run(context.Background(), os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "simdevice:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, out io.Writer) error {
	fs := flag.NewFlagSet("simdevice", flag.ContinueOnError)
	url := fs.String("url", "http://127.0.0.1:8080", "beenfard base URL")
	macFlag := fs.String("mac", "", "the device's MAC address")
	statePath := fs.String("state", "", "file that keeps the device's key between runs")
	keyFlag := fs.String("key", "", "use this key (32 hex digits) instead of the stored one")
	model := fs.String("model", "U7PG2", "model code to report")
	reset := fs.Bool("reset", false, "factory reset first: forget the stored key")
	if err := fs.Parse(args); err != nil {
		return err
	}
	mac, err := net.ParseMAC(*macFlag)
	if err != nil {
		return fmt.Errorf("-mac: %w", err)
	}
	if *statePath == "" {
		return errors.New("-state is required")
	}

	var st state
	if b, err := os.ReadFile(*statePath); err == nil && !*reset {
		if err := json.Unmarshal(b, &st); err != nil {
			return fmt.Errorf("reading %s: %w", *statePath, err)
		}
	}

	key, which := inform.DefaultKey(), "default"
	switch {
	case *keyFlag != "":
		if key, err = inform.ParseKey(*keyFlag); err != nil {
			return fmt.Errorf("-key: %w", err)
		}
		which = "given"
	case st.Key != "":
		if key, err = inform.ParseKey(st.Key); err != nil {
			return fmt.Errorf("stored key: %w", err)
		}
		which = "adopted"
	}

	msg, _ := json.Marshal(map[string]any{"mac": mac.String(), "model": *model, "version": "4.0.66.10832", "cfgversion": st.CfgVersion})
	pkt, err := inform.Seal(mac, inform.FlagEncrypted|inform.FlagSnappy, key, msg)
	if err != nil {
		return err
	}
	wire, err := pkt.MarshalBinary()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, *url+"/inform", bytes.NewReader(wire))
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	res := result{Status: resp.StatusCode, Key: which}
	if resp.StatusCode == http.StatusOK {
		rp, err := inform.Parse(body)
		if err != nil {
			return fmt.Errorf("reply: %w", err)
		}
		plain, err := rp.Decode(key)
		if err != nil {
			return fmt.Errorf("the reply is not sealed with the key the device used: %w", err)
		}
		var reply map[string]any
		if err := json.Unmarshal(plain, &reply); err != nil {
			return err
		}
		res.Type, _ = reply["_type"].(string)
		if res.Type == "setdefault" {
			st = state{}
		}
		if cfgText, ok := reply["mgmt_cfg"].(string); ok && res.Type == "setparam" {
			if err := adopt(&st, cfgText); err != nil {
				return err
			}
		}
	}
	if err := saveState(*statePath, st); err != nil {
		return err
	}
	return json.NewEncoder(out).Encode(res)
}

// adopt stores the key and config version from a setparam's mgmt_cfg.
func adopt(st *state, mgmtCfg string) error {
	cfg, err := inform.ParseConfig(mgmtCfg)
	if err != nil {
		return err
	}
	if v, ok := cfg.Get(inform.KeyAuthKey); ok {
		if _, err := inform.ParseKey(v); err != nil {
			return fmt.Errorf("authkey in setparam: %w", err)
		}
		st.Key = v
	}
	if v, ok := cfg.Get(inform.KeyCfgVersion); ok {
		st.CfgVersion = v
	}
	return nil
}

func saveState(path string, st state) error {
	b, err := json.Marshal(st)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o600)
}
